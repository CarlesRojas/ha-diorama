#!/usr/bin/env python3
"""Build a Diorama-ready .glb from a YAML spec of simple primitives.

The model is assembled from rounded boxes, cylinders, lathes, spheres, tori,
rods and prisms, in meters, in Diorama's frame: x to the right, y up, z toward
the front (the side that faces into the room). Parts and groups get node names
with Diorama behavior tags, e.g. "Shade [glow]" or "Door [hinge y 90]", and a
group with a motion gets its node origin at its pivot, so the patched Diorama
importer can swing, slide, spin, light and show/hide them. A part with
`top: true` is named "Board [top]", which makes its upper face a top other
pieces can stand on: a table's top, each board of a shelf unit.

Usage:
  python3 build_model.py spec.yaml -o out/            # .glb + preview + report
  python3 build_model.py spec.yaml -o out/ --no-preview
  python3 build_model.py spec.yaml -o out/ --states 0,0.5,1

Needs only numpy and pyyaml; matplotlib for the preview.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("pyyaml is missing: pip install pyyaml")

# Limits of Diorama's importer (src/decoration/models.ts).
MAX_TRIANGLES = 60000
WARN_TRIANGLES = 20000
MAX_PARTS = 16
MAX_TOPS = 12
FINISHES = {"matte", "fabric", "wood", "ceramic", "metal"}
LOOKS = {"glow", "led", "on", "off"}
MOTIONS = {"hinge", "slide", "spin"}
DEFAULT_COLOR = "#e8e1d5"  # Diorama's linen
CREASE_DEG = 40.0

# --------------------------------------------------------------------------
# Geometry helpers. Every primitive returns (V: (n,3) float, F: (m,3) int)
# in its own frame; transforms are applied afterwards.
# --------------------------------------------------------------------------


def _grid_faces(rows: int, cols: int, offset: int = 0, flip: bool = False):
    """Quads of a rows x cols vertex grid as triangles."""
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            a = offset + i * cols + j
            b = a + 1
            c = a + cols
            d = c + 1
            if flip:
                faces += [(a, b, c), (b, d, c)]
            else:
                faces += [(a, c, b), (b, c, d)]
    return faces


def rounded_box(w: float, h: float, d: float, r: float = 0.0, seg: int = 4):
    """Box standing on y=0, centered on x and z, with rounded edges of radius r."""
    half = np.array([w / 2, h / 2, d / 2])
    r = float(max(0.0, min(r, *(half * 0.999))))
    inner = half - r

    def coords(axis: int):
        if r <= 1e-6:
            return np.array([-half[axis], half[axis]])
        t = np.linspace(0, math.pi / 2, seg + 1)
        lo = -inner[axis] - r * np.cos(t)
        hi = inner[axis] + r * np.sin(t)
        out = np.concatenate([lo, hi])
        return np.unique(np.round(out, 9))

    cs = [coords(0), coords(1), coords(2)]
    V, F = [], []
    # Six faces: (fixed axis, sign, u axis, v axis)
    for ax in range(3):
        u_ax, v_ax = [a for a in range(3) if a != ax]
        for sign in (-1, 1):
            us, vs = cs[u_ax], cs[v_ax]
            base = len(V)
            for u in us:
                for v in vs:
                    p = np.zeros(3)
                    p[ax] = sign * half[ax]
                    p[u_ax] = u
                    p[v_ax] = v
                    V.append(p)
            # Orientation: right-handed so normals point out.
            flip = (sign > 0) == ((u_ax, v_ax) in [(1, 2), (2, 0), (0, 1)])
            F += _grid_faces(len(us), len(vs), base, flip=not flip)
    V = np.array(V)
    if r > 1e-6:
        c = np.clip(V, -inner, inner)
        delta = V - c
        n = np.linalg.norm(delta, axis=1, keepdims=True)
        n[n < 1e-12] = 1
        V = c + delta / n * r
    V[:, 1] += h / 2
    return V, np.array(F)


def lathe(profile, seg: int = 32, thickness: float = 0.0):
    """Revolve a profile of [radius, y] points around the y axis.

    With a thickness, the profile becomes a wall: an inner copy offset inward
    by `thickness` closes it, so a lamp shade or a pot is solid from inside.
    Endpoints with radius 0 close naturally.
    """
    prof = [(float(r), float(y)) for r, y in profile]
    if thickness > 0:
        inner = [(max(r - thickness, 0.0), y) for r, y in prof]
        prof = prof + inner[::-1] + [prof[0]]
    n = len(prof)
    ang = np.linspace(0, 2 * math.pi, seg, endpoint=False)
    V = []
    for r, y in prof:
        for a in ang:
            V.append((r * math.sin(a), y, r * math.cos(a)))
    V = np.array(V)
    F = []
    for i in range(n - 1):
        for j in range(seg):
            a = i * seg + j
            b = i * seg + (j + 1) % seg
            c = (i + 1) * seg + j
            d = (i + 1) * seg + (j + 1) % seg
            F += [(a, b, c), (b, d, c)]
    F = np.array(F)
    # Orient outward: compare the mean normal with the radial direction.
    if _signed_volume(V, F) < 0:
        F = F[:, ::-1]
    # Close open ends with a fan when the first/last radius is not zero.
    caps = []
    if thickness <= 0:
        for idx, flip in ((0, True), (n - 1, False)):
            r, y = prof[idx]
            if r > 1e-6:
                center = len(V) + len(caps)
                caps.append((0.0, y, 0.0))
                for j in range(seg):
                    a = idx * seg + j
                    b = idx * seg + (j + 1) % seg
                    F = np.vstack([F, (center, b, a) if not flip else (center, a, b)])
        if caps:
            V = np.vstack([V, np.array(caps)])
            if _signed_volume(V, F) < 0:
                F = F[:, ::-1]
    return V, F


def cylinder(radius: float, height: float, radius_top: float | None = None, seg: int = 32):
    rt = radius if radius_top is None else radius_top
    return lathe([(0, 0), (radius, 0), (rt, height), (0, height)], seg)


def capsule(radius: float, height: float, seg: int = 24):
    straight = max(height - 2 * radius, 0.0)
    prof = []
    for k in range(seg // 2 + 1):
        t = -math.pi / 2 + math.pi / 2 * k / (seg // 2)
        prof.append((radius * math.cos(t), radius + radius * math.sin(t)))
    for k in range(seg // 2 + 1):
        t = math.pi / 2 * k / (seg // 2)
        prof.append((radius * math.cos(t), radius + straight + radius * math.sin(t)))
    prof[0] = (0, 0)
    prof[-1] = (0, height if height > 2 * radius else 2 * radius)
    return lathe(prof, seg)


def sphere(radius: float, seg: int = 32, top_only: bool = False):
    rings = max(seg // 2, 4)
    start = 0 if not top_only else rings // 2
    prof = []
    for k in range(start, rings + 1):
        t = -math.pi / 2 + math.pi * k / rings
        prof.append((radius * math.cos(t), radius * math.sin(t)))
    if top_only:
        prof = [(0.0, 0.0)] + prof
    prof[-1] = (0.0, prof[-1][1])
    if not top_only:
        prof[0] = (0.0, prof[0][1])
    return lathe(prof, seg)


def torus(radius: float, tube: float, seg: int = 32, tube_seg: int = 12):
    V, F = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(tube_seg):
            b = 2 * math.pi * j / tube_seg
            r = radius + tube * math.cos(b)
            V.append((r * math.sin(a), tube * math.sin(b), r * math.cos(a)))
    for i in range(seg):
        for j in range(tube_seg):
            a = i * tube_seg + j
            b = i * tube_seg + (j + 1) % tube_seg
            c = ((i + 1) % seg) * tube_seg + j
            d = ((i + 1) % seg) * tube_seg + (j + 1) % tube_seg
            F += [(a, c, b), (b, c, d)]
    V, F = np.array(V), np.array(F)
    if _signed_volume(V, F) < 0:
        F = F[:, ::-1]
    return V, F


def _ear_clip(pts):
    """Triangulate a simple polygon (list of 2D points)."""
    P = [tuple(p) for p in pts]
    if len(P) > 3 and P[0] == P[-1]:
        P = P[:-1]
    area = sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
    idx = list(range(len(P)))
    if area < 0:
        idx.reverse()

    def inside(p, a, b, c):
        def s(p1, p2, p3):
            return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

        d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
        return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))

    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        n = len(idx)
        for k in range(n):
            i0, i1, i2 = idx[(k - 1) % n], idx[k], idx[(k + 1) % n]
            a, b, c = P[i0], P[i1], P[i2]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if cross <= 1e-12:
                continue
            if any(inside(P[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((i0, i1, i2))
            idx.pop(k)
            break
        else:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    return P, tris


def prism(points, height: float, plane: str = "xz"):
    """Extrude a 2D outline. plane xz: points are [x, z], extruded up along y
    from 0 to height. plane xy: points are [x, y], extruded toward the front
    along z from 0 to height (use it as a depth)."""
    P, tris = _ear_clip(points)
    n = len(P)

    def lift(p, t):
        if plane == "xy":
            return (p[0], p[1], t)
        return (p[0], t, p[1])

    V = [lift(p, 0.0) for p in P] + [lift(p, height) for p in P]
    F = []
    for a, b, c in tris:
        F.append((a, c, b))
        F.append((a + n, b + n, c + n))
    for i in range(n):
        j = (i + 1) % n
        F += [(i, j, i + n), (j, j + n, i + n)]
    V, F = np.array(V, float), np.array(F)
    if _signed_volume(V, F) < 0:
        F = F[:, ::-1]
    return V, F


def _signed_volume(V, F):
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def rotation_matrix(deg):
    rx, ry, rz = [math.radians(float(v)) for v in deg]
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz  # three.js Euler order XYZ


def rod(start, end, radius: float, seg: int = 16):
    a, b = np.array(start, float), np.array(end, float)
    length = float(np.linalg.norm(b - a))
    V, F = cylinder(radius, length, seg=seg)
    y = np.array([0.0, 1.0, 0.0])
    d = (b - a) / max(length, 1e-9)
    v = np.cross(y, d)
    c = float(np.dot(y, d))
    if np.linalg.norm(v) < 1e-9:
        R = np.eye(3) if c > 0 else np.diag([1.0, -1.0, -1.0])
    else:
        vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
        R = np.eye(3) + vx + vx @ vx * (1 / (1 + c))
    return V @ R.T + a, F


# --------------------------------------------------------------------------
# Spec → scene
# --------------------------------------------------------------------------


@dataclass
class MeshNode:
    name: str  # full node name, with tag
    label: str  # name without tag
    V: np.ndarray  # absolute model coordinates
    F: np.ndarray
    color: str
    finish: str
    top: bool = False  # its upper face is a top other pieces can stand on


@dataclass
class GroupNode:
    name: str
    label: str
    pivot: np.ndarray  # absolute
    motion: dict | None = None
    look: str | None = None
    children: list = field(default_factory=list)


def parse_tag(tag: str | None):
    """Validate a tag string like 'hinge y 90' / 'glow 0.6' / 'on'."""
    if not tag:
        return None, None
    words = str(tag).strip().strip("[]").split()
    verb = words[0].lower()
    if verb in LOOKS:
        if verb == "glow" and len(words) > 1:
            float(words[1])
        return None, " ".join(words)
    if verb in MOTIONS:
        axis = words[1] if len(words) > 1 else "y"
        if not re.fullmatch(r"[+-]?[xyzXYZ]", axis):
            raise ValueError(f"bad axis in tag '{tag}', use x, y, z, -x, -y or -z")
        if len(words) > 2:
            float(words[2])
        return " ".join(words), None
    raise ValueError(f"unknown tag '{tag}', use one of {sorted(LOOKS | MOTIONS)}")


def build_primitive(part: dict, seg_default: int):
    shape = part.get("shape", "box")
    seg = int(part.get("segments", seg_default))
    if shape == "box":
        w, h, d = part["size"]
        V, F = rounded_box(w, h, d, float(part.get("radius", 0.0)), int(part.get("round_segments", 4)))
    elif shape == "cylinder":
        V, F = cylinder(float(part["radius"]), float(part["height"]), part.get("radius_top"), seg)
    elif shape == "capsule":
        V, F = capsule(float(part["radius"]), float(part["height"]), seg)
    elif shape == "sphere":
        V, F = sphere(float(part["radius"]), seg, bool(part.get("dome", False)))
    elif shape == "lathe":
        V, F = lathe(part["profile"], seg, float(part.get("thickness", 0.0)))
    elif shape == "torus":
        V, F = torus(float(part["radius"]), float(part["tube"]), seg, int(part.get("tube_segments", 12)))
    elif shape == "prism":
        V, F = prism(part["points"], float(part["height"]), part.get("plane", "xz"))
    elif shape == "rod":
        V, F = rod(part["from"], part["to"], float(part["radius"]), seg if "segments" in part else 16)
        return V, F  # rods are placed by their endpoints
    else:
        raise ValueError(f"unknown shape '{shape}'")
    if "scale" in part:
        V = V * np.array(part["scale"], float)
    if "rot" in part:
        V = V @ rotation_matrix(part["rot"]).T
    V = V + np.array(part.get("at", [0, 0, 0]), float)
    return V, F


def _flip_tag(tag, axis: str):
    """A motion tag as seen in the mirror: a hinge or spin turns the other way
    round every axis but the mirror's own, a slide flips along the mirror axis."""
    if not tag:
        return tag
    words = str(tag).strip().strip("[]").split()
    verb = words[0].lower()
    if verb not in MOTIONS:
        return tag
    ax = words[1] if len(words) > 1 else "y"
    sign, letter = ("-" if ax.startswith("-") else ""), ax.lstrip("+-").lower()
    flip = (letter != axis) if verb in ("hinge", "spin") else (letter == axis)
    if flip:
        sign = "" if sign == "-" else "-"
    return " ".join([verb, sign + letter] + words[2:])


def mirror_copy(part: dict, axis: str):
    """A copy of a part or group mirrored across the x=0 (or z=0) plane."""
    k = {"x": 0, "z": 2}[axis]
    q = json.loads(json.dumps(part))
    q.pop("mirror", None)
    if "at" in q:
        q["at"][k] = -q["at"][k]
    if "pivot" in q:
        q["pivot"][k] = -q["pivot"][k]
    if "tag" in q:
        q["tag"] = _flip_tag(q["tag"], axis)
    if q.get("shape") == "rod":
        q["from"][k] = -q["from"][k]
        q["to"][k] = -q["to"][k]
    if q.get("shape") == "prism":
        plane = q.get("plane", "xz")
        if axis == "x":
            q["points"] = [[-p[0], p[1]] for p in q["points"]][::-1]
        elif plane == "xz":
            q["points"] = [[p[0], -p[1]] for p in q["points"]][::-1]
        else:
            q.setdefault("at", [0, 0, 0])
            q["at"][2] -= float(q["height"])
    if "rot" in q:
        r = q["rot"]
        q["rot"] = [r[0], -r[1], -r[2]] if axis == "x" else [-r[0], -r[1], r[2]]
    if "parts" in q:
        q["parts"] = [mirror_copy(c, axis) for c in q["parts"]]
    return q


def build_tree(items: list, seg: int, path=""):
    nodes = []
    for raw in items:
        copies = [raw]
        if raw.get("mirror"):
            copies.append(mirror_copy(raw, raw["mirror"]))
        for item in copies:
            if "group" in item:
                label = str(item["group"])
                motion, look = parse_tag(item.get("tag"))
                pivot = np.array(item.get("pivot", [0, 0, 0]), float)
                if motion and "pivot" not in item:
                    raise ValueError(f"group '{label}' has a motion tag but no pivot")
                name = f"{label} [{motion or look}]" if (motion or look) else label
                g = GroupNode(name, label, pivot, motion, look)
                g.children = build_tree(item.get("parts", []), seg, path + "/" + label)
                nodes.append(g)
            else:
                label = str(item.get("name", "Part"))
                motion, look = parse_tag(item.get("tag"))
                V, F = build_primitive(item, seg)
                finish = str(item.get("finish", "matte"))
                if finish not in FINISHES:
                    raise ValueError(f"part '{label}': finish must be one of {sorted(FINISHES)}")
                color = str(item.get("color", DEFAULT_COLOR))
                if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                    raise ValueError(f"part '{label}': color must look like #a1b2c3")
                mesh = MeshNode(f"{label} [{look}]" if look else label, label, V, F, color, finish)
                mesh.top = bool(item.get("top", False))
                if motion:
                    # A motion on a single part: wrap it in a group at its pivot.
                    if "pivot" not in item:
                        raise ValueError(f"part '{label}' has a motion tag but no pivot")
                    g = GroupNode(f"{label} [{motion}]", label, np.array(item["pivot"], float), motion, None)
                    mesh.name = label if not look else mesh.name
                    g.children = [mesh]
                    nodes.append(g)
                else:
                    nodes.append(mesh)
    return nodes


def walk_meshes(nodes, motion=None, look=None, pivot=None):
    """Yield (mesh, motion, look, pivot) with inherited tags, nearest wins."""
    for n in nodes:
        if isinstance(n, GroupNode):
            m = motion
            p = pivot
            if n.motion and motion is None:
                m, p = n.motion, n.pivot
            elif n.motion:
                m, p = n.motion, n.pivot  # nearest wins
            lk = n.look or look
            yield from walk_meshes(n.children, m, lk, p)
        else:
            own_look = None
            if "[" in n.name:
                own_look = n.name[n.name.index("[") + 1 : n.name.index("]")]
            yield n, motion, own_look or look, pivot


# --------------------------------------------------------------------------
# Normals, welding
# --------------------------------------------------------------------------


def weld(V, F, tol=1e-6):
    key = np.round(V / tol).astype(np.int64)
    _, idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    F2 = inv[F]
    keep = (F2[:, 0] != F2[:, 1]) & (F2[:, 1] != F2[:, 2]) & (F2[:, 0] != F2[:, 2])
    return V[idx], F2[keep]


def creased(V, F, crease_deg=CREASE_DEG):
    """Split vertices so edges sharper than the crease stay sharp; smooth normals otherwise."""
    V, F = weld(V, F)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    area = np.linalg.norm(fn, axis=1, keepdims=True)
    fn_unit = fn / np.maximum(area, 1e-20)
    cos_lim = math.cos(math.radians(crease_deg))
    incident = [[] for _ in range(len(V))]
    for f, tri in enumerate(F):
        for v in tri:
            incident[v].append(f)
    outV, outN, outF = [], [], np.zeros_like(F)
    cache = {}
    for f, tri in enumerate(F):
        for k, v in enumerate(tri):
            faces = incident[v]
            sel = [g for g in faces if float(np.dot(fn_unit[g], fn_unit[f])) >= cos_lim]
            key = (v, tuple(sorted(sel)))
            if key not in cache:
                n = fn[sel].sum(axis=0)
                n = n / max(np.linalg.norm(n), 1e-20)
                cache[key] = len(outV)
                outV.append(V[v])
                outN.append(n)
            outF[f, k] = cache[key]
    return np.array(outV, np.float32), np.array(outN, np.float32), outF.astype(np.uint32)


# --------------------------------------------------------------------------
# GLB writer
# --------------------------------------------------------------------------


def hex_to_linear(hex_color: str):
    c = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def write_glb(nodes, path: Path, model_name: str):
    gltf = {
        "asset": {"version": "2.0", "generator": "diorama-3d-model build_model.py"},
        "scene": 0,
        "scenes": [{"name": model_name, "nodes": []}],
        "nodes": [],
        "meshes": [],
        "materials": [],
        "accessors": [],
        "bufferViews": [],
        "buffers": [],
    }
    blob = bytearray()
    materials = {}

    def add_view(data: bytes, target: int):
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(data)
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        return len(gltf["bufferViews"]) - 1

    def material_for(m: MeshNode):
        key = (m.color, m.finish, m.label)
        if key not in materials:
            metal = 1.0 if m.finish == "metal" else 0.0
            rough = {"metal": 0.35, "ceramic": 0.25, "wood": 0.7, "fabric": 0.95, "matte": 0.85}[m.finish]
            gltf["materials"].append(
                {
                    "name": f"{m.finish} {m.label}",
                    "pbrMetallicRoughness": {
                        "baseColorFactor": hex_to_linear(m.color) + [1.0],
                        "metallicFactor": metal,
                        "roughnessFactor": rough,
                    },
                }
            )
            materials[key] = len(gltf["materials"]) - 1
        return materials[key]

    def add_mesh(m: MeshNode, origin):
        V, N, F = creased(m.V - origin, m.F)
        vb = add_view(V.astype("<f4").tobytes(), 34962)
        nb = add_view(N.astype("<f4").tobytes(), 34962)
        big = len(V) > 65535
        ib = add_view(F.astype("<u4" if big else "<u2").reshape(-1).tobytes(), 34963)
        acc = gltf["accessors"]
        acc.append({"bufferView": vb, "componentType": 5126, "count": len(V), "type": "VEC3",
                    "min": V.min(axis=0).tolist(), "max": V.max(axis=0).tolist()})
        acc.append({"bufferView": nb, "componentType": 5126, "count": len(N), "type": "VEC3"})
        acc.append({"bufferView": ib, "componentType": 5125 if big else 5123, "count": int(F.size), "type": "SCALAR"})
        n = len(acc)
        gltf["meshes"].append({"name": m.name, "primitives": [{
            "attributes": {"POSITION": n - 3, "NORMAL": n - 2}, "indices": n - 1, "material": material_for(m)}]})
        return len(gltf["meshes"]) - 1, int(len(F))

    tri_total = 0

    def add_node(n, parent_origin):
        nonlocal tri_total
        if isinstance(n, GroupNode):
            origin = n.pivot if n.motion else parent_origin
            node = {"name": n.name}
            t = (origin - parent_origin).tolist()
            if any(abs(x) > 1e-12 for x in t):
                node["translation"] = t
            gltf["nodes"].append(node)
            idx = len(gltf["nodes"]) - 1
            kids = [add_node(c, origin) for c in n.children]
            if kids:
                gltf["nodes"][idx]["children"] = kids
            return idx
        mesh_idx, tris = add_mesh(n, parent_origin)
        tri_total += tris
        # The top tag goes on the node alone, after any look the name carries.
        gltf["nodes"].append({"name": f"{n.name} [top]" if n.top else n.name, "mesh": mesh_idx})
        return len(gltf["nodes"]) - 1

    zero = np.zeros(3)
    gltf["scenes"][0]["nodes"] = [add_node(n, zero) for n in nodes]
    while len(blob) % 4:
        blob.append(0)
    gltf["buffers"].append({"byteLength": len(blob)})
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    path.write_bytes(out)
    return tri_total


# --------------------------------------------------------------------------
# Diorama view: what the importer will make of it, and posed states
# --------------------------------------------------------------------------


def tidy(name: str):
    return re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]", " ", re.sub(r"\.\d{3,}$", "", name)).replace("_", " ")).strip()[:40]


def axis_vec(word):
    s = -1.0 if word.startswith("-") else 1.0
    v = {"x": [1, 0, 0], "y": [0, 1, 0], "z": [0, 0, 1]}[word.lstrip("+-").lower()]
    return np.array(v, float) * s


def pose(V, motion, pivot, open_level, spin_angle=0.0):
    if not motion:
        return V
    words = motion.split()
    kind, axis = words[0], axis_vec(words[1] if len(words) > 1 else "y")
    amount = float(words[2]) if len(words) > 2 else {"hinge": 90, "slide": 0.3, "spin": 1}[kind]
    if kind == "slide":
        return V + axis * amount * open_level
    ang = math.radians(amount) * open_level if kind == "hinge" else spin_angle
    k = axis
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    R = np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
    return (V - pivot) @ R.T + pivot


def report(nodes, tri_total, spec, out_glb):
    meshes = list(walk_meshes(nodes))
    allV = np.vstack([m.V for m, *_ in meshes])
    lo, hi = allV.min(axis=0), allV.max(axis=0)
    middle = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    size = hi - lo
    parts = {}
    for m, motion, look, pivot in meshes:
        key = (tidy(m.label).lower(), motion, look, None if pivot is None else tuple(np.round(pivot, 4)))
        parts.setdefault(key, {"name": tidy(m.label), "motion": motion, "look": look,
                               "pivot": None if pivot is None else (pivot - middle).round(4).tolist(),
                               "color": m.color, "finish": m.finish, "triangles": 0})
        parts[key]["triangles"] += len(m.F)
    # Name the parts the way Diorama's editor will: still parts first, then
    # the active ones, a repeated name numbered from 2.
    used = set()
    ordered = [p for p in parts.values() if not p["motion"] and not p["look"]] + [
        p for p in parts.values() if p["motion"] or p["look"]
    ]
    for i, p in enumerate(ordered):
        base = p["name"] or f"Part {i + 1}"
        name, n = base, 2
        while name.lower() in used:
            name, n = f"{base} {n}", n + 1
        used.add(name.lower())
        p["name"] = name
    parts = {i: p for i, p in enumerate(ordered)}
    warnings = []
    if tri_total > MAX_TRIANGLES:
        warnings.append(f"{tri_total} triangles: Diorama refuses more than {MAX_TRIANGLES}. Lower segments.")
    elif tri_total > WARN_TRIANGLES:
        warnings.append(f"{tri_total} triangles: may stutter on a wall tablet (warn above {WARN_TRIANGLES}).")
    still = [p for p in parts.values() if not p["motion"] and not p["look"]]
    active = [p for p in parts.values() if p["motion"] or p["look"]]
    if len(still) + len(active) > MAX_PARTS:
        warnings.append(f"{len(still) + len(active)} parts: Diorama merges still parts by material above {MAX_PARTS}. Reuse names for parts of the same color.")
    for p in active:
        if p["pivot"] is not None:
            pv = np.array(p["pivot"]) + middle
            if np.any(pv < lo - 0.05) or np.any(pv > hi + 0.05):
                warnings.append(f"pivot of '{p['name']}' lies outside the model's box, check it.")
    if abs(lo[1]) > 0.002:
        warnings.append(f"lowest point is at y={lo[1]:.3f}; Diorama stands the model on its lowest point anyway.")
    signals = set()
    for p in active:
        if p["look"] in ("glow", "led") or (p["look"] or "").startswith("glow"):
            signals |= {"toggle", "level", "color", "warmth"}
        if p["look"] in ("on", "off"):
            signals.add("toggle")
        if p["motion"]:
            signals |= {"toggle", "level"}
    # The tops as Diorama's importer reads them: the box round each still part
    # tagged for it, seen from above, two at one height that touch being one.
    boxes = []
    for m, motion, _look, _pivot in meshes:
        if not m.top:
            continue
        if motion:
            warnings.append(f"top on '{tidy(m.label)}' is ignored: a part that moves cannot be stood on.")
            continue
        a, b = m.V.min(axis=0), m.V.max(axis=0)
        box = [float(b[1]), float(a[0]), float(b[0]), float(a[2]), float(b[2])]
        near = 0.005
        for other in boxes:
            if (abs(other[0] - box[0]) <= near and other[1] <= box[2] + near and box[1] <= other[2] + near
                    and other[3] <= box[4] + near and box[3] <= other[4] + near):
                other[0] = max(other[0], box[0])
                other[1], other[2] = min(other[1], box[1]), max(other[2], box[2])
                other[3], other[4] = min(other[3], box[3]), max(other[4], box[4])
                break
        else:
            boxes.append(box)
    tops = sorted(
        ({"height_y": round(y - float(lo[1]), 3), "width_x": round(x1 - x0, 3), "depth_z": round(z1 - z0, 3)}
         for y, x0, x1, z0, z1 in boxes),
        key=lambda t: t["height_y"],
    )
    if len(tops) > MAX_TOPS:
        warnings.append(f"{len(tops)} tops: Diorama keeps the {MAX_TOPS} widest.")
    if tops and spec.get("mount") == "ceiling":
        warnings.append("tops are ignored on a model that hangs from the ceiling.")
    return {
        "file": str(out_glb),
        "name": spec.get("name"),
        "mount": spec.get("mount", "floor"),
        "size_m": {"width_x": round(float(size[0]), 3), "depth_z": round(float(size[2]), 3), "height_y": round(float(size[1]), 3)},
        "triangles": tri_total,
        "parts": list(parts.values()),
        "signals": sorted(signals),
        "bindable": bool(signals),
        "tops": tops,
        "support": bool(tops),
        "warnings": warnings,
    }, (lo, hi)


def render_preview(nodes, path: Path, title: str, states):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    meshes = list(walk_meshes(nodes))
    allV = np.vstack([m.V for m, *_ in meshes])
    lo, hi = allV.min(axis=0), allV.max(axis=0)
    span = float((hi - lo).max()) * 0.6 + 1e-6
    mid = (lo + hi) / 2
    # Front left and front right, a little from above, as a room is seen.
    views = [(-60, 24), (-125, 20)]
    fig = plt.figure(figsize=(4.2 * len(states), 4.2 * len(views)), facecolor="#1e2124")
    light = np.array([0.4, 0.8, 0.6])
    light /= np.linalg.norm(light)
    for si, level in enumerate(states):
        for vi, (az, el) in enumerate(views):
            ax = fig.add_subplot(len(views), len(states), vi * len(states) + si + 1, projection="3d")
            ax.set_facecolor("#1e2124")
            polys, colors = [], []
            # Direction toward the camera in model axes (plot x, y, z = model x, -z, y).
            a, e = math.radians(az), math.radians(el)
            eye_plot = np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])
            eye = np.array([eye_plot[0], eye_plot[2], -eye_plot[1]])
            for m, motion, look, pivot in meshes:
                on = level > 0
                lk = (look or "").split()[0] if look else None
                if lk == "on" and not on:
                    continue
                if lk == "off" and on:
                    continue
                V = pose(m.V, motion, pivot, level, spin_angle=0.6 * level)
                tri = V[m.F]
                n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
                # Faces turned away are left out, which the painter's sort needs.
                front = n @ eye > -0.02
                tri, n = tri[front], n[front]
                shade = 0.35 + 0.65 * np.clip(n @ light, 0, 1)
                base = np.array([int(m.color[i : i + 2], 16) / 255 for i in (1, 3, 5)])
                if lk in ("glow", "led") and on:
                    base = np.array([1.0, 0.86, 0.6])
                    shade = np.ones_like(shade)
                col = np.clip(base[None, :] * shade[:, None], 0, 1)
                # matplotlib is z-up and right handed: plot (x, y, z) = model (x, -z, y).
                plot = tri[:, :, [0, 2, 1]].copy()
                plot[:, :, 1] *= -1
                polys.extend(plot)
                colors.extend(col)
            pc = Poly3DCollection(polys, facecolors=colors, edgecolors="none", linewidths=0)
            ax.add_collection3d(pc)
            ax.set_xlim(mid[0] - span, mid[0] + span)
            ax.set_ylim(-mid[2] - span, -mid[2] + span)
            ax.set_zlim(max(lo[1], mid[1] - span), max(lo[1], mid[1] - span) + 2 * span)
            ax.view_init(elev=el, azim=az)
            ax.set_box_aspect((1, 1, 1))
            ax.set_axis_off()
            label = "aus / zu" if level == 0 else f"an / offen {int(level * 100)}%"
            if vi == 0:
                ax.set_title(label, color="#e6e6e6", fontsize=10)
    fig.suptitle(title, color="#ffffff", fontsize=12)
    fig.tight_layout()
    fig.savefig(path, dpi=110, facecolor=fig.get_facecolor())
    plt.close(fig)


def slugify(name: str):
    s = re.sub(r"[^a-zA-Z0-9]+", "_", name.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")).strip("_")
    return s or "model"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("."))
    ap.add_argument("--no-preview", action="store_true")
    ap.add_argument("--states", default="0,1", help="open levels to preview, e.g. 0,0.5,1")
    args = ap.parse_args()

    spec = yaml.safe_load(args.spec.read_text())
    name = spec.get("name") or args.spec.stem
    seg = int(spec.get("segments", 32))
    nodes = build_tree(spec.get("parts", []), seg)
    if not nodes:
        sys.exit("spec has no parts")
    args.out.mkdir(parents=True, exist_ok=True)
    slug = spec.get("file") or slugify(name)
    glb = args.out / f"{slug}.glb"
    tris = write_glb(nodes, glb, name)
    rep, _ = report(nodes, tris, spec, glb)
    if not args.no_preview:
        png = args.out / f"{slug}_preview.png"
        render_preview(nodes, png, name, [float(x) for x in args.states.split(",")])
        rep["preview"] = str(png)
    (args.out / f"{slug}_report.json").write_text(json.dumps(rep, indent=2, ensure_ascii=False))
    print(json.dumps(rep, indent=2, ensure_ascii=False))
    if any("refuses" in w for w in rep["warnings"]):
        sys.exit(2)


if __name__ == "__main__":
    main()

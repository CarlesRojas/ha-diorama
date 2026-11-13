# Model builder

Builds a .glb for the editor's Import a model from a YAML file of simple
shapes: rounded boxes, cylinders, lathes, spheres, tori, rods and prisms, in
meters, with x to the right, y up and z toward the front. Parts and groups
are named with the tags `src/decoration/modelTags.ts` reads, so a lamp's
shade glows and a cabinet's doors swing with the device bound to the piece.

```bash
pip install numpy pyyaml matplotlib
python3 tools/model-builder/build_model.py tools/model-builder/examples/kommode.yaml -o out/
```

It writes the .glb, a preview of the model shut and open, off and on, and a
report of its size, triangles, parts and what they do, named as the editor
will name them. `pnpm dev` and `src/dev/models.html?glb=/out/kommode.glb`
draw it in the card with a made up device.

A part with `top: true` is named with the `[top]` tag, which makes its upper
face a top other pieces can stand on, like a table's. Give it to every board
of a shelf unit and each one can be stood on, the highest one first. The
report lists the tops it will have under `tops`.

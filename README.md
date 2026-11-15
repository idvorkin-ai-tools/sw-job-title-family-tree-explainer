# Software job title family tree: interactive explainer

Live: https://idvorkin-ai-tools.github.io/sw-job-title-family-tree-explainer/

An interactive, phone-friendly take on Ian Miell's
[Software Industry Job Titles family tree](https://ianmiell.github.io/sw-job-title-family-tree/)
([source repo](https://github.com/ianmiell/sw-job-title-family-tree)). The titles, dates, families
and parent links in `data.json` are derived from his graph; the layout, interaction and the short
per-title write-ups are new and original to this repo. Corrections to the graph itself belong upstream.

## Collapse model

Families are vertical lanes on a shared five-year time axis. Folding a family narrows its lane to a
strip of dots: no title and no edge is ever removed, so the multi-parent graph stays honest. When
the screen is too narrow for another open lane, the family opened longest ago folds, so the map
never scrolls sideways. Tapping a title traces its lineage (direct links strongest, wider "grew out
of" ancestry fainter). The URL hash (`#open=dev,ops&sel=sre`) carries the view.

Plain static HTML/CSS/JS, no build step. Serve the directory with any static server.

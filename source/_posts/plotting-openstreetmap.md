---
title: Plotting OpenStreetMap
date: 2026-08-18 22:00:00
thumbnail: plot.png
thumbnail_alt:
short:
tags:
---

# Overview
This is the blog format of a talk given at [State of the Map US 2026](https://state-of-the-map-us-2026.sessionize.com/session/1150888). I hadn't presented a talk in a few years, and they're great motivating factors for polishing up side projects. The submission deadline for conferences is quite a few months before the conference itself, so I put down the gist of the talk before and planned to finish the project if it was accepted. I opted for a 5 minute lightning talk, knowing that if all else failed I'd at least be able to show a few pictures.

It was accepted.

# Setup
## Python!
For this project, I used python to download and transform OpenStreetMap data as well as to preview and generate the SVGs for plotting.

I made great use of iPython/Jupyter notebooks for these projects, as it's nice to have variables floating around in memory for quick iteration and visual debugging.

### Packages
```
requires-python = ">=3.13"
dependencies = [
    "geopandas>=1.1.3",
    "lonboard>=0.16.0",
    "overpass>=0.8.2",
    "pyarrow>=24.0.0",
    "pycairo>=1.29.0",
]
```
This is the main collection of packages needed to run the code in this post. Other packages will be pulled in as dependencies (ex. shapely).

# Loading OpenStreetMap Data
There are 101 ways[^1] to download OpenStreetMap data. For this example, I'm going to use the [overpass python package](https://pypi.org/project/overpass/). Overpass isn't my favorite, due to the query language, but it's useful for quick projects and portability.

First, pick a bounding box using the ever-trusty [bboxfinder.com](https://bboxfinder.com/)[^2]. Since the conference was in Madison, Wisconsin - the map will be of Madison, Wisconsin!

```python
from geopandas import GeoDataFrame
import overpass

MADISON_BBOX = "43.030753,-89.544754,43.159613,-89.263229"
api = overpass.API(timeout=120)

def query_overpass(types: str, tags: dict, bbox: str = MADISON_BBOX) -> GeoDataFrame:
    tags_str = "".join(f'["{key}"="{value}"]' for key, value in tags.items())

    # Write your raw Overpass QL query
    query = f"""
    {types}{tags_str}({bbox});
    out geom;
    """

    response = api.get(query)
    gdf = GeoDataFrame.from_features(response["features"], crs="EPSG:4326")
    gdf = gdf.rename_geometry("geom")
    gdf = gdf.to_crs("EPSG:3857")
    return gdf

cafes = query_overpass("node", {"amenity":"cafe"})
lakes = query_overpass("wr", {"natural":"water", "water":"lake"})
```

I'm going to skip explaining [OverpassQL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL) as there are other resources out there.

The two features I'm pulling to use for the map are cafe[^3] nodes [`amenity=cafe`](https://wiki.openstreetmap.org/wiki/Tag:amenity=cafe) and lake way and relations [`natural=water`](https://wiki.openstreetmap.org/wiki/Tag:natural%3Dwater), [`water=lake`](https://wiki.openstreetmap.org/wiki/Tag:water%3Dlake). It may also make sense to pull cafe ways, as cafes can be mapped as polygons as well but that exercise is left to the reader.

## Look At Your Data!
```python
print("Cafes:", len(cafes))
print(cafes.head())
print("Lakes:", len(lakes))
print(lakes.head())

```
|Category|Total Count|Index|Type|ID|Geometry|Tags|
|--------|--------|--------|--------|--------|--------|--------|
|Cafes|172|0|node|567937911|POINT (-9948165.325 5324459.96)|"{'addr:city': 'Madison', 'addr:housenumber': '...}"|
|Lakes|6|1|relation|1997948|"MULTIPOLYGON (((-9951890.075 5321016.883, -995..."|"{'intermittent': 'no', 'name': 'Lake Monona', ...}"|

(Table reformatted from `head()` output for blog.)

This looks roughly correct, there are 172 cafes and Lake Monona is in there.

## Map Your Data!
[lonboard](https://github.com/developmentseed/lonboard) is a great library for visualizing dataframes within notebooks. It can handle way more than 172 cafes and 6 lakes.

```python
import lonboard

def preview_layers_from_df(df):
    points = df[df.geometry.geom_type == "Point"]
    polys = df[df.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]

    layers = []
    if not points.empty:
        layers.append(lonboard.ScatterplotLayer.from_geopandas(
                points, 
                radius_min_pixels=4
            )
        )
    if not polys.empty:
        layers.append(lonboard.SolidPolygonLayer.from_geopandas(
                polys,
                get_fill_color=[146, 221, 252]
            )
        )

    return layers

layers = preview_layers_from_df(cafes) + preview_layers_from_df(lakes)

lonboard.Map(layers=layers)
```

<iframe src="lonboard_rawdata.html" width="100%" height="400px"></iframe>

# Creating SVGs from GeoDataFrames
This section is going to get lengthy and less visually mappy and more math mappy. Feel free to skip to "Preparing to Print," I'll never know.

For creating and drawing SVGs, I use a combination of [shapely](https://shapely.readthedocs.io/en/stable/) and [pycairo](https://pycairo.readthedocs.io/en/latest/). pycairo reminds me of moving the turtle around in [Logo](https://en.wikipedia.org/wiki/Logo_(programming_language)).

After some iteration, I've set up this class. I removed some elements for brevity -

```python
from io import BytesIO
from pathlib import Path
from typing import Optional

import cairo
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box

class SVGManager:
    def __init__(
        self,
        width: int,
        height: int,
        line_width: float = 1,
    ):
        self.width = width
        self.height = height
        self.svgio = BytesIO()
        self.surface = cairo.SVGSurface(self.svgio, width, height)
        self.surface.set_document_unit(cairo.SVGUnit.PX)
        self._scale = 100
        self._context = cairo.Context(self.surface)
        self._context.scale(self._scale, self._scale)
        self._context.set_source_rgba(1, 0.2, 0.2)
        self._context.set_line_width(line_width)
        self._svg = None

    @property
    def svg(self) -> BytesIO:
        self.surface.finish()
        return self.svgio

    @property
    def color(self):
        pass

    @color.setter
    def color(self, color: tuple[float, float, float, Optional[float]]):
        self._context.set_source_rgba(*color)

    def set_line_width(self, line_width: float):
        self._context.set_line_width(line_width)

    def write_to_svg(self, path: str):
        path = Path(path)
        if path.is_file():
            raise RuntimeError("File exists.")
        with open(path, "wb") as file:
            file.write(self.svg.getbuffer())

    def _scale_geom(self, geom):
        geom = affinity.scale(geom, yfact=-1, origin=(1, 0))
        geom = affinity.translate(geom, xoff=0, yoff=self.height / self._scale)
        return geom

    def draw_point(self, point: Point, color=None, radius=0.01):
        if color:
            self._context.set_source_rgba(*color)
        point = self._scale_geom(point)
        self._context.arc(point.x, point.y, radius, 0, 3.14 * 2)
        self._context.stroke()

    def draw_polygon(self, polygon: Polygon, color=None):
        polygon = self._scale_geom(polygon)
        if color:
            self._context.set_source_rgba(*color)
        first_pt = polygon.exterior.coords[0]
        self._context.move_to(first_pt[0], first_pt[1])
        for point in polygon.exterior.coords:
            self._context.line_to(point[0], point[1])
        self._context.stroke()

    def draw_multipolygon(self, multipolygon:MultiPolygon, color=None):
        for polygon in multipolygon.geoms:
            self.draw_polygon(polygon, color=color)

    def draw_shape(self, shape: Point | Polygon | MultiPolygon):
        if isinstance(shape, MultiPolygon):
            self.draw_multipolygon(shape)
        elif isinstance(shape, Point):
            self.draw_point(shape)
        elif isinstance(shape, Polygon):
            self.draw_polygon(shape)
        else:
            raise NotImplementedError()

    def get_svg_logical_size(self):
        # SVGManager scales cairo context internally; draw functions use logical units.
        logical_width = self.width / self._scale
        logical_height = self.height / self._scale
        return logical_width, logical_height
```

**SVGManager** is manipulating information in cartesian space. It's created with a number of pixels (like 500 x 500) which we have to draw our map data on. The problem is our map data is in Web Mercator coordinates (`EPSG:3857`). We will need another set of utilities to re-project our data from that space, to the pixels that make up our SVG.

```python
"""
Utilities to convert to scaled SVG coordinate space
"""
from functools import partial
from shapely.ops import transform

# Function to project a single (x, y) pair to canvas units
def _project_to_canvas(x_3857, y_3857, scale, min_x, min_y, x_off=0.0, y_off=0.0):
    x_rel = x_3857 - min_x
    y_rel = y_3857 - min_y

    x_canvas = x_rel * scale + x_off
    y_canvas = y_rel * scale + y_off
    return x_canvas, y_canvas

def _transform_coords(geom, proj):
    return transform(proj, geom)

def _make_canvas_projector(min_x, min_y, max_x, max_y, target_w, target_h, pad=0.03):
    # Uniform scale keeps geometry aspect ratio for non-square extents.
    data_w = max(max_x - min_x, 1e-12)
    data_h = max(max_y - min_y, 1e-12)

    inner_w = target_w * (1 - 2 * pad)
    inner_h = target_h * (1 - 2 * pad)
    if inner_w <= 0 or inner_h <= 0:
        raise ValueError("pad is too large for target dimensions")

    scale = min(inner_w / data_w, inner_h / data_h)
    used_w = data_w * scale
    used_h = data_h * scale

    x_off = (target_w - used_w) / 2.0
    y_off = (target_h - used_h) / 2.0

    proj = partial(
        _project_to_canvas,
        scale=scale,
        min_x=min_x,
        min_y=min_y,
        x_off=x_off,
        y_off=y_off,
    )
    return proj, {
        "scale": scale,
        "data_w": data_w,
        "data_h": data_h,
        "target_w": target_w,
        "target_h": target_h,
        "used_w": used_w,
        "used_h": used_h,
        "x_off": x_off,
        "y_off": y_off,
        "pad": pad,
    }

def reproject_to_svg_frame(geoseries, svg_manager, pad=0.03):
    min_x, min_y, max_x, max_y = geoseries.total_bounds
    target_w, target_h = svg_manager.get_svg_logical_size()
    proj, fit = _make_canvas_projector(
        min_x, min_y, max_x, max_y, target_w, target_h, pad=pad
    )
    reproj = geoseries.apply(lambda geom: _transform_coords(geom, proj))
    return reproj, fit
```

Are there better ways to do this? Probably. For one, you can do this all in [QGIS](https://www.qgis.org/) which has SVG export support as well as great [plugins](https://plugins.qgis.org/plugins/QuickOSM/) for downloading OSM data. But I'm already here, and so I continue on.[^4]

While AI tools make this type of work a lot quicker than before, some of the fun was the messy maps that would come from getting the math wrong. While I won't claim that writing the code yourself makes you a better person, I would at least suggest modifying random things to see what happens. One nice thing is the wealth of debug information you can have presented to you.

For example I had these two utilities added on.

```python
def projection_debug_report(source_geoseries, projected_geoseries, fit):
    src_min_x, src_min_y, src_max_x, src_max_y = source_geoseries.total_bounds
    prj_min_x, prj_min_y, prj_max_x, prj_max_y = projected_geoseries.total_bounds

    src_w = src_max_x - src_min_x
    src_h = src_max_y - src_min_y
    src_aspect = src_w / max(src_h, 1e-12)
    tgt_aspect = fit["target_w"] / max(fit["target_h"], 1e-12)
    prj_w = prj_max_x - prj_min_x
    prj_h = prj_max_y - prj_min_y

    left_margin = prj_min_x
    right_margin = fit["target_w"] - prj_max_x
    bottom_margin = prj_min_y
    top_margin = fit["target_h"] - prj_max_y

    print("=== Projection Debug ===")
    print(f"source bounds: ({src_min_x:.3f}, {src_min_y:.3f}) -> ({src_max_x:.3f}, {src_max_y:.3f})")
    print(f"source size/aspect: {src_w:.3f} x {src_h:.3f} | aspect={src_aspect:.4f}")
    print(f"target frame: {fit['target_w']:.3f} x {fit['target_h']:.3f} | aspect={tgt_aspect:.4f}")
    print(f"used frame:   {fit['used_w']:.3f} x {fit['used_h']:.3f} | scale={fit['scale']:.8f}")
    print(f"projected size: {prj_w:.3f} x {prj_h:.3f}")
    print(
        f"margins L/R/B/T: {left_margin:.3f}, {right_margin:.3f}, "
        f"{bottom_margin:.3f}, {top_margin:.3f}"
    )
```
This first one will print out the scaling information, for example with our Madison example and a 500x500 SVGManager we get the following:
```
=== Projection Debug ===
source bounds: (-9968375.512, 5314702.778) -> (-9936177.885, 5336133.000)
source size/aspect: 32197.628 x 21430.223 | aspect=1.5024
target frame: 500.000 x 500.000 | aspect=1.0000
used frame:   499.000 x 332.126 | scale=0.01549804
projected size: 499.000 x 332.126
margins L/R/B/T: 0.500, 0.500, 83.937, 83.937
```

The following utility will adds a blue bounding box around the map data. As you can see above, the "projected size" is 499x332. This means we don't use up the whole canvas, and this blue box will visualize that new rectangle.

```python
def draw_canvas_debug_overlay(svg_manager, fit, color=(0.0, 0.0, 1.0, 0.8)):
    # Draw target frame and fitted content rectangle for visual debugging.
    target_w, target_h = fit["target_w"], fit["target_h"]
    content_x0, content_y0 = fit["x_off"], fit["y_off"]
    content_x1 = content_x0 + fit["used_w"]
    content_y1 = content_y0 + fit["used_h"]

    frame = Polygon([(0, 0), (target_w, 0), (target_w, target_h), (0, target_h), (0, 0)])
    content = Polygon([
        (content_x0, content_y0),
        (content_x1, content_y0),
        (content_x1, content_y1),
        (content_x0, content_y1),
        (content_x0, content_y0),
    ])

    prev_color = (1.0, 0.2, 0.2, 1.0)
    svg_manager.color = color
    svg_manager.draw_polygon(frame)
    svg_manager.draw_polygon(content)
    svg_manager.color = prev_color
```

# Preparing for Print
Let's get back to `cafes` and `lakes`. At state of the map, I showed the difference between plotting three different representations of this data. The first was to plot it "plainly", as a dot density map, as this will draw the cafes as points and the lakes as polygons.

This is quite straightforward, initialize an SVGManager and draw the things.

```python
from pandas import concat
from geopandas import GeoSeries

svg_manager = SVGManager(500, 500)

combined_layers = GeoSeries(
    concat([cafes.geometry, lakes.geometry], ignore_index=True),
    crs=cafes.crs,
 )
reproj, fit = reproject_to_svg_frame(combined_layers, svg_manager, pad=0.001)

projection_debug_report(combined_layers, reproj, fit)
draw_canvas_debug_overlay(svg_manager, fit)

reproj.apply(svg_manager.draw_shape)
```

{% box cafes_20260711_135232_072217.svg "SVG plot proof showing Madison's cafes and nearby lakes." %}

This leaves something to be desired though, especially at different zooms. Where the overlapping points will mean the pen repeatedly marks the same spot.

## Buffer and Dissolve
Two classic geospatial operations for manipulating polygons are buffer and dissolve. Buffer is the process of increasing the size of the shape, points will turn into polygons and polygons will turn into bigger polygons. We do this to prepare the data for our next operation, dissolve. Dissolve will join overlapping polygons, optionally grouped by a specific attribute.

```python
from shapely.ops import unary_union

svg_manager = SVGManager(500, 500)

# Regular Points
svg_manager.draw_point(Point(250, 375), radius=5)
svg_manager.draw_point(Point(275, 400), radius=5)

# Buffered Points
svg_manager.draw_polygon(Point(250, 250).buffer(25))
svg_manager.draw_polygon(Point(275, 275).buffer(25))

# Dissolved + Buffered Points
dissolved_circles = unary_union(
    [Point(250, 100).buffer(25), Point(275, 125).buffer(25)]
)
svg_manager.draw_polygon(dissolved_circles)
```
{% box cafes_20260815_173948_948287.svg "Top: Two 'Points', Middle: Two Buffered 'Points', Bottom: Two Buffered + Dissolved 'Points'" %}

('Points' is in quotes, because even a point is a circle with the way we render them.)

Now for our final code blob - which will produce the buffer + dissolved svg for the plotter.
```python
from pandas import concat

svg_manager = SVGManager(500, 500)

working = cafes.copy()
working['way_buffer'] = working.geom.buffer(155) # Use magic numbers, they're good
working = working.set_geometry('way_buffer')
_ = working.sindex
dissolved = working.dissolve()

geoms = dissolved.way_buffer

combined_layers = GeoSeries(
    concat([geoms.geometry, lakes.geometry], ignore_index=True),
    crs=cafes.crs,
 )
reproj, fit = reproject_to_svg_frame(combined_layers, svg_manager, pad=0.001)
reproj.apply(svg_manager.draw_shape)
IPython.display.SVG(data=svg_manager.svg.getvalue())
```

# Finally Plotting
I use an [AxiDraw V3](https://shop.evilmadscientist.com/productsmenu/846) which is no longer available, though there are many other plotters now available.

{% gif point_crop.mp4 point_cover.png %}

With buffers + dissolve

{% gif buffer_dissolve_crop.mp4 buffer_dissolve_cover.png %}

## What's next?

This buffer and dissolve technique is great at all scales or with all shapes of data. [Convex hull](https://geopandas.org/en/stable/docs/reference/api/geopandas.GeoSeries.convex_hull.html) is another fun operation to pull points together. Think about what you're trying to show - and the constraints of dragging a pen across the paper to do so.

# References
[^1]: For example, I learned about [layercake](https://openstreetmap.us/our-work/layercake/) at the conference.
[^2]: Go CUGOS!
[^3]: Are cafes just coffee shops? It depends who you ask.
[^4]: Alan from Stamen gave a [great talk](https://state-of-the-map-us-2026.sessionize.com/session/1148777) on their survey on cartographic tooling. Plotting workflows were not well featured.
"""Zips the fixtures that come zipped: a KMZ, and a Shapefile with its sidecar files."""
import zipfile

with zipfile.ZipFile("places.kmz", "w", zipfile.ZIP_DEFLATED) as kmz:
    kmz.write("places.kml", "doc.kml")

with zipfile.ZipFile("places-utm.zip", "w", zipfile.ZIP_DEFLATED) as shp:
    for ext in ("shp", "shx", "dbf", "prj"):
        shp.write(f"places-utm.{ext}", f"places-utm/places-utm.{ext}")

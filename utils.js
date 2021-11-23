// Return a map's boundary coordinates as an array
// Padding is given as a fraction of the map, so 0.5 means
// the boundary is enlarged by 50%
function boundsToBboxString(bounds) {
	const max_lat = bounds.getNorth(),
	      min_lat = bounds.getSouth(),
		  max_lng = bounds.getEast(),
		  min_lng = bounds.getWest();
    const bboxString = [min_lng, min_lat, max_lng, max_lat].join();

    return bboxString
}

function getMapBoundCoords(map, pad=0.5) {
	const mapBounds = map.getBounds().pad(pad);
	const ne = mapBounds.getNorthEast(),
	      nw = mapBounds.getNorthWest(),
		  se = mapBounds.getSouthEast(),
		  sw = mapBounds.getSouthWest();
	const mapBoundCoords = [[sw.lat, sw.lng], [nw.lat, nw.lng], [ne.lat, ne.lng], [se.lat, se.lng]];

    return mapBoundCoords
}

function wktComponentsToBboxString(components) {
    const xs = components[0].map(item => item.x),
          ys = components[0].map(item => item.y);
    const min_lng = Math.min(...xs),
          min_lat = Math.min(...ys),
          max_lng = Math.max(...xs),
          max_lat = Math.max(...ys);

    const bboxString = [min_lng, min_lat, max_lng, max_lat].join();

    return bboxString
}

function addCellsToCoverLayer(cellsToAdd, coverLayer, cellToBoundaryFunc, cellsCache, id_key) {
    cellsToAdd.forEach((cellId) => {
        if (cellsCache.includes(cellId)) {
            return;
        } else {
            const poly = L.polygon(cellToBoundaryFunc(cellId));
            let polyGeoJSON = poly.toGeoJSON();
            polyGeoJSON.properties = {[id_key]: cellId};
            coverLayer.addData(polyGeoJSON);
            cellsCache.push(cellId);
        }
    });
};

function generateButtonsPopup(geomItems) {
    let individualButtons = [];
    for (const [key, value] of Object.entries(geomItems)) {
        const geomButton = `<button type="button" class="copy-button" onclick="copyTextToClipboard('${value}')">${key}</button>`
        individualButtons.push(geomButton)
    }

    const buttonsPopup = `<h2>Copy to clipboard</h2><div class="button-holder">${individualButtons.join('')}</div>`

    return buttonsPopup
}

function tablePopup(f, l) {
    let tableElements = []
    for (const [key, value] of Object.entries(f.properties)) {
        tableElements.push(`<tr><td><strong>${key}</strong></td><td>${value}</td></tr>`)
    }
    const table = `<table>
        <tbody>
        ${tableElements.join('')}
        </tbody>
    </table>
    `
    l.bindPopup(table);
}

// From https://stackoverflow.com/questions/18014907/leaflet-draw-retrieve-layer-type-on-drawedited-event
 function getLayerType(layer) {
    if (layer instanceof L.Circle) {return 'circle';}
    if (layer instanceof L.Marker) {return 'marker';}
    if ((layer instanceof L.Polyline) && ! (layer instanceof L.Polygon)) {return 'polyline';}
    if ((layer instanceof L.Polygon) && ! (layer instanceof L.Rectangle)) {return 'polygon';}
    if (layer instanceof L.Rectangle) {return 'rectangle';}
};

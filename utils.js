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

function generateButtonsHtml(geomItems) {
    let individualButtons = [];
    for (const [key, value] of Object.entries(geomItems)) {
        const geomButton = `<button onclick="copyTextToClipboard('${value}')">${key}</button>`
        individualButtons.push(geomButton)
    }
    geomButtons = '<strong>Copy to clipboard</strong><br>' + individualButtons.join('<br>')

    return geomButtons
}

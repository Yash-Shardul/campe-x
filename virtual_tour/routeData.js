/**
 * ============================================================
 * CampeX - Campus Route Navigation Data & Utilities
 * routeData.js
 * ============================================================
 * This file defines:
 *   1. CAMPUS_LOCATIONS  — canonical places with display names
 *                          and their representative scene IDs
 *   2. CAMPUS_GRAPH      — adjacency map (which scene IDs connect)
 *   3. findRoute()       — BFS path finder (scene-ID level)
 *   4. getLocationBySceneId() / getLocationById() — helpers
 * ============================================================
 */

'use strict';

/* ============================================================
 * 1. CAMPUS LOCATIONS
 *    id          : unique key used in graph & dropdowns
 *    name        : human-readable display name
 *    sceneId     : the Marzipano scene ID that represents this place
 *    description : short description shown in UI
 * ============================================================ */
var CAMPUS_LOCATIONS = [
  {
    id: 'main_entrance',
    name: 'Main Entrance',
    sceneId: '77-gate-a-1',
    description: 'Main entrance (Gate A) of KBTCOE campus'
  },
  {
    id: 'main_gate',
    name: 'Main Gate (Gate B)',
    sceneId: '0-entrance-gate-b',
    description: 'Main entrance of KBTCOE campus'
  },
  {
    id: 'ground',
    name: 'Ground',
    sceneId: '1-ground-center',
    description: 'Main athletic ground of the campus'
  },
  {
    id: 'basketball_court',
    name: 'Basketball Court',
    sceneId: '3-groung-basketball',
    description: 'Outdoor basketball and sports area'
  },
  {
    id: 'foursquare',
    name: 'Four Square',
    sceneId: '6-foursquare-entrance',
    description: 'Central quadrangle of the campus'
  },
  {
    id: 'a_building',
    name: 'A Building',
    sceneId: '8-a-building-entrance-1',
    description: 'Administrative building with offices, library, and MBA dept'
  },
  {
    id: 'admin_office',
    name: 'Admin Office',
    sceneId: '19-a-building--office-main',
    description: 'Main administrative office inside A Building'
  },
  {
    id: 'library',
    name: 'Central Library',
    sceneId: '29-a-building-1-floor-library',
    description: 'Central library on the 1st floor of A Building'
  },
  {
    id: 'seminar_hall',
    name: 'Seminar Hall (C Building)',
    sceneId: '42-c-seminal-hall1',
    description: 'Seminar hall inside C Building'
  },
  {
    id: 'canteen',
    name: 'Canteen',
    sceneId: '15-canteen-1',
    description: 'College canteen and food court'
  },
  {
    id: 'workshop',
    name: 'Workshop',
    sceneId: '18-workshop-entrance',
    description: 'Engineering workshop with CNC and machinery'
  },
  {
    id: 'c_building',
    name: 'C Building',
    sceneId: '32-c-building-entrance',
    description: 'C Building housing Civil, IT, ECE, EE departments'
  },
  {
    id: 'gymkhana',
    name: 'Gymkhana',
    sceneId: '34-gymkhana',
    description: 'Sports complex next to C Building'
  },
  {
    id: 'b_building_entry',
    name: 'B Building Entry Point',
    sceneId: '82-b-entrance',
    description: 'Entry point of the B Building'
  },
  {
    id: 'mech_seminar_hall',
    name: 'Mechanical Seminar Hall',
    sceneId: '94-mech-seminar-hall',
    description: 'Mechanical department seminar hall in B Building'
  },
  {
    id: 'computer_center',
    name: 'Computer Center',
    sceneId: '104-computer-center',
    description: 'Computer center in B Building'
  }
];

/* ============================================================
 * 2. CAMPUS GRAPH  (scene-ID level adjacency)
 *    Each key is a scene ID, value is an array of directly
 *    reachable scene IDs via existing link hotspots.
 *    This mirrors the actual hotspot connections in data.js.
 * ============================================================ */
var CAMPUS_GRAPH = {
  /* ─── Main Entrance (Gate A) ─────────────────────────── */
  '77-gate-a-1': ['78-gate-a-2'],
  '78-gate-a-2': ['77-gate-a-1', '79-gate-a-3'],
  '79-gate-a-3': ['78-gate-a-2', '80-gate-a-4', '82-b-entrance'],
  '80-gate-a-4': ['79-gate-a-3', '81-foursquare-entrance'],
  '81-foursquare-entrance': ['80-gate-a-4', '14-foursquare-center', '9-foursquare-lefttop', '10-foursquare-righttop'],

  /* ─── Main Gate (Gate B) ─────────────────────────────── */
  '0-entrance-gate-b': ['4-entrance-1'],

  /* ─── Entrance Road ──────────────────────────────────── */
  '4-entrance-1': ['0-entrance-gate-b', '11-entrance-3', '1-ground-center'],

  /* ─── Ground ─────────────────────────────────────────── */
  '1-ground-center': ['4-entrance-1', '3-groung-basketball', '2-ground-greengym'],
  '2-ground-greengym': ['1-ground-center'],
  '3-groung-basketball': ['1-ground-center', '32-c-building-entrance', '11-entrance-3'],

  /* ─── Entrance Corridor (to Canteen / Workshop) ──────── */
  '11-entrance-3': ['4-entrance-1', '18-workshop-entrance', '12-entrance-4'],
  '12-entrance-4': ['11-entrance-3', '13-entrance-5'],
  '13-entrance-5': ['12-entrance-4', '15-canteen-1'],

  /* ─── Canteen ────────────────────────────────────────── */
  '5-canteen-top': ['15-canteen-1'],
  '15-canteen-1': ['13-entrance-5', '5-canteen-top'],

  /* ─── Workshop ───────────────────────────────────────── */
  '18-workshop-entrance': ['17-workshop-1', '11-entrance-3', '32-c-building-entrance', '3-groung-basketball'],
  '17-workshop-1': ['18-workshop-entrance', '16-workshop2'],
  '16-workshop2': ['17-workshop-1'],

  /* ─── Four Square (Central Quad) ─────────────────────── */
  '6-foursquare-entrance': ['32-c-building-entrance', '14-foursquare-center', '7-foursquare-leftbottom', '8-a-building-entrance-1'],
  '7-foursquare-leftbottom': ['6-foursquare-entrance', '9-foursquare-lefttop', '14-foursquare-center'],
  '9-foursquare-lefttop': ['10-foursquare-righttop', '7-foursquare-leftbottom', '81-foursquare-entrance'],
  '10-foursquare-righttop': ['8-a-building-entrance-1', '21-a-building-ground', '9-foursquare-lefttop', '81-foursquare-entrance'],
  '14-foursquare-center': ['6-foursquare-entrance', '8-a-building-entrance-1', '21-a-building-ground', '81-foursquare-entrance'],

  /* ─── A Building ─────────────────────────────────────── */
  '8-a-building-entrance-1': ['14-foursquare-center', '10-foursquare-righttop', '6-foursquare-entrance', '19-a-building--office-main'],
  '19-a-building--office-main': ['8-a-building-entrance-1', '20-a-building-principal-cabin'],
  '20-a-building-principal-cabin': ['19-a-building--office-main', '21-a-building-ground'],
  '21-a-building-ground': ['10-foursquare-righttop', '20-a-building-principal-cabin', '31-a-building-1-floor-entrance'],
  '31-a-building-1-floor-entrance': ['27-a-building-2-floor-entrance', '21-a-building-ground', '29-a-building-1-floor-library'],
  '29-a-building-1-floor-library': ['31-a-building-1-floor-entrance', '30-a-building-2-floor-library'],
  '30-a-building-2-floor-library': ['29-a-building-1-floor-library', '27-a-building-2-floor-entrance'],
  '27-a-building-2-floor-entrance': ['30-a-building-2-floor-library', '26-a-building-3-floor-entrance', '31-a-building-1-floor-entrance'],
  '26-a-building-3-floor-entrance': ['24-a-building-4-floor-entrance', '27-a-building-2-floor-entrance', '25-a-building-3-floor-center'],
  '25-a-building-3-floor-center': ['26-a-building-3-floor-entrance'],
  '24-a-building-4-floor-entrance': ['22-a-building-4-floor-center', '26-a-building-3-floor-entrance'],
  '22-a-building-4-floor-center': ['24-a-building-4-floor-entrance', '23-a-building-4-floor-gd', '28-a-building-4-floor-tnp-seminar-hall'],
  '23-a-building-4-floor-gd': ['22-a-building-4-floor-center'],
  '28-a-building-4-floor-tnp-seminar-hall': ['22-a-building-4-floor-center'],

  /* ─── C Building ─────────────────────────────────────── */
  '32-c-building-entrance': ['18-workshop-entrance', '35-c-g0', '6-foursquare-entrance', '34-gymkhana'],
  '34-gymkhana': ['35-c-g0', '32-c-building-entrance'],
  '35-c-g0': ['36-c-g1', '45-c-1st-0', '41-c-g3', '32-c-building-entrance', '34-gymkhana', '33-c-building-g--c'],
  '33-c-building-g--c': ['35-c-g0', '37-c-g2', '36-c-g1', '43-c-seminar-hall-2', '45-c-1st-0', '41-c-g3'],
  '36-c-g1': ['35-c-g0', '33-c-building-g--c', '37-c-g2', '46-c-1st-1', '42-c-seminal-hall1', '43-c-seminar-hall-2'],
  '37-c-g2': ['33-c-building-g--c', '36-c-g1', '41-c-g3', '40-c-g2-lab1'],
  '40-c-g2-lab1': ['37-c-g2'],
  '41-c-g3': ['35-c-g0', '37-c-g2', '38-c-g3-lab1', '39-c-g3-lab2', '33-c-building-g--c'],
  '38-c-g3-lab1': ['41-c-g3'],
  '39-c-g3-lab2': ['41-c-g3'],
  '42-c-seminal-hall1': ['36-c-g1'],
  '43-c-seminar-hall-2': ['33-c-building-g--c', '36-c-g1'],

  /* ─── B Building ─────────────────────────────────────── */
  '82-b-entrance': ['79-gate-a-3', '83-b-g0'],
  '83-b-g0': ['82-b-entrance', '86-b-g3', '84-b-g1', '89-b-1st-0'],
  '84-b-g1': ['83-b-g0', '85-b-g2'],
  '85-b-g2': ['84-b-g1', '86-b-g3'],
  '86-b-g3': ['83-b-g0', '85-b-g2', '94-mech-seminar-hall', '92-b-1st-3'],
  '94-mech-seminar-hall': ['86-b-g3'],
  '89-b-1st-0': ['83-b-g0', '90-b-1st-1'],
  '90-b-1st-1': ['89-b-1st-0', '91-b-1st-2'],
  '91-b-1st-2': ['90-b-1st-1', '92-b-1st-3'],
  '92-b-1st-3': ['91-b-1st-2', '86-b-g3', '93-b-1st-4'],
  '93-b-1st-4': ['92-b-1st-3'],
  '96-b-2nd-0': ['97-b-2nd-1', '101-b-3rd-0'],
  '97-b-2nd-1': ['96-b-2nd-0', '100-computer-center', '98-b-2nd-2'],
  '98-b-2nd-2': ['97-b-2nd-1', '99-b-2nd-3'],
  '99-b-2nd-3': ['98-b-2nd-2', '103-b-3rd-2'],
  '100-computer-center': ['97-b-2nd-1'],
  '101-b-3rd-0': ['96-b-2nd-0', '102-b-3rd-1', '103-b-3rd-2'],
  '102-b-3rd-1': ['101-b-3rd-0', '103-b-3rd-2', '104-computer-center'],
  '103-b-3rd-2': ['101-b-3rd-0', '102-b-3rd-1', '99-b-2nd-3'],
  '104-computer-center': ['102-b-3rd-1']
};

/* ============================================================
 * 3. BFS ROUTE FINDER
 *    findRoute(graph, startSceneId, destSceneId)
 *    Returns an ordered array of scene IDs from start → dest,
 *    or null if no path exists.
 * ============================================================ */
function findRoute(graph, startSceneId, destSceneId) {
  if (startSceneId === destSceneId) return [startSceneId];

  var visited = {};
  var queue = [[startSceneId]]; // queue of paths

  visited[startSceneId] = true;

  while (queue.length > 0) {
    var path = queue.shift();
    var current = path[path.length - 1];
    var neighbors = graph[current] || [];

    for (var i = 0; i < neighbors.length; i++) {
      var neighbor = neighbors[i];

      if (visited[neighbor]) continue;
      visited[neighbor] = true;

      var newPath = path.concat([neighbor]);

      if (neighbor === destSceneId) {
        return newPath; // ✅ Found the shortest path
      }

      queue.push(newPath);
    }
  }

  return null; // No path found
}

/* ============================================================
 * 4. HELPER UTILITIES
 * ============================================================ */

/** Get a location object by its unique id */
function getLocationById(id) {
  for (var i = 0; i < CAMPUS_LOCATIONS.length; i++) {
    if (CAMPUS_LOCATIONS[i].id === id) return CAMPUS_LOCATIONS[i];
  }
  return null;
}

/** Get a location object by its sceneId */
function getLocationBySceneId(sceneId) {
  for (var i = 0; i < CAMPUS_LOCATIONS.length; i++) {
    if (CAMPUS_LOCATIONS[i].sceneId === sceneId) return CAMPUS_LOCATIONS[i];
  }
  return null;
}

/** Get a display name for a sceneId (falls back to sceneId itself) */
function getDisplayNameForScene(sceneId) {
  var loc = getLocationBySceneId(sceneId);
  if (loc) return loc.name;
  // Fallback: prettify raw scene id
  return sceneId.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
}

// Expose globals so index.js and the inline HTML scripts can access them
window.CAMPUS_LOCATIONS   = CAMPUS_LOCATIONS;
window.CAMPUS_GRAPH       = CAMPUS_GRAPH;
window.findRoute          = findRoute;
window.getLocationById    = getLocationById;
window.getLocationBySceneId = getLocationBySceneId;
window.getDisplayNameForScene = getDisplayNameForScene;

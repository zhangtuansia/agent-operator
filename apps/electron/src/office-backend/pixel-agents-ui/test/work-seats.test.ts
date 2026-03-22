import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildFurnitureCatalog } from '../shared/assets/build.ts';
import { OfficeState } from '../src/office/engine/officeState.ts';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.ts';
import { layoutToSeats } from '../src/office/layout/layoutSerializer.ts';
import { CharacterState } from '../src/office/types.ts';
import type { OfficeLayout, PlacedFurniture } from '../src/office/types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'public', 'assets');

function prepareCatalog(): void {
  const catalog = buildFurnitureCatalog(assetsDir);
  const sprites = Object.fromEntries(catalog.map((entry) => [entry.id, [['#000000']]]));
  buildDynamicCatalog({ catalog, sprites });
}

function loadDefaultLayout(): OfficeLayout {
  const defaultLayoutFile = fs
    .readdirSync(assetsDir)
    .flatMap((file) => {
      const match = /^default-layout-(\d+)\.json$/.exec(file);
      return match ? [{ file, revision: Number(match[1]) }] : [];
    })
    .sort((a, b) => b.revision - a.revision)[0]?.file;

  return JSON.parse(
    fs.readFileSync(path.join(assetsDir, defaultLayoutFile || 'default-layout-1.json'), 'utf8'),
  ) as OfficeLayout;
}

test('default layout room is larger than the original footprint', () => {
  const layout = loadDefaultLayout();

  assert.equal(layout.cols, 33);
  assert.equal(layout.rows, 28);
  assert.equal(layout.layoutRevision, 3);
  assert.ok(layout.furniture.length >= 60, 'expected the expanded office to include more zones');
});

function seatFurnitureType(
  layout: OfficeLayout,
  seatId: string,
): PlacedFurniture['type'] | undefined {
  const baseUid = seatId.split(':')[0];
  return layout.furniture.find((item) => item.uid === baseUid)?.type;
}

test('default layout keeps sofa seating out of the work-seat pool', () => {
  prepareCatalog();
  const layout = loadDefaultLayout();
  const seats = layoutToSeats(layout.furniture);

  const sofaUids = layout.furniture
    .filter((item) => item.type.startsWith('SOFA_'))
    .map((item) => item.uid);
  const sofaSeats = [...seats.values()].filter(
    (seat) => sofaUids.includes(seat.uid) || sofaUids.includes(seat.uid.split(':')[0]),
  );

  assert.ok(sofaSeats.length > 0, 'expected sofa seats in the default layout');
  assert.ok(sofaSeats.every((seat) => !seat.isWorkSeat), 'sofa seats should be lounge seats');
});

test('new agents prefer computer workstations over lounge seating', () => {
  prepareCatalog();
  const layout = loadDefaultLayout();
  const officeState = new OfficeState(layout);

  officeState.addAgent(1, 0, 0);

  const agent = officeState.characters.get(1);
  assert.ok(agent?.seatId, 'expected the agent to receive a seat');

  const seat = officeState.seats.get(agent!.seatId!);
  assert.ok(seat?.isWorkSeat, 'expected the assigned seat to be a work seat');
  assert.notEqual(
    seatFurnitureType(layout, agent!.seatId!),
    'SOFA_FRONT',
    'agent should not be assigned to the lounge sofa front',
  );
  assert.notEqual(
    seatFurnitureType(layout, agent!.seatId!),
    'SOFA_BACK',
    'agent should not be assigned to the lounge sofa back',
  );
  assert.notEqual(
    seatFurnitureType(layout, agent!.seatId!),
    'SOFA_SIDE',
    'agent should not be assigned to the lounge sofa side',
  );
  assert.notEqual(
    seatFurnitureType(layout, agent!.seatId!),
    'SOFA_SIDE:left',
    'agent should not be assigned to the mirrored lounge sofa side',
  );
});

test('short turns still send a newly spawned agent to their work seat', () => {
  prepareCatalog();
  const layout = loadDefaultLayout();
  const officeState = new OfficeState(layout);

  officeState.addAgent(1, 0, 0);

  const agent = officeState.characters.get(1);
  assert.ok(agent?.seatId, 'expected the agent to receive a seat');

  // Reproduce the short-turn case: the agent becomes active and then inactive
  // before the first normal movement tick has a chance to run.
  agent!.tileCol = 16;
  agent!.tileRow = 14;
  agent!.x = 16 * 16 + 8;
  agent!.y = 14 * 16 + 8;
  agent!.path = [];
  agent!.moveProgress = 0;

  const seat = officeState.seats.get(agent!.seatId!);
  assert.ok(seat?.isWorkSeat, 'expected the assigned seat to be a work seat');

  officeState.setAgentActive(1, true);
  officeState.setAgentActive(1, false);

  let reachedSeat = false;
  for (let i = 0; i < 120; i++) {
    officeState.update(0.1);
    const current = officeState.characters.get(1);
    if (!current) break;
    if (current.tileCol === seat!.seatCol && current.tileRow === seat!.seatRow) {
      reachedSeat = true;
      break;
    }
  }

  assert.ok(reachedSeat, 'agent should still finish walking to their seat after a short turn');
});

test('inactive agents wander first and then rest on lounge seating', () => {
  prepareCatalog();
  const layout = loadDefaultLayout();
  const officeState = new OfficeState(layout);

  officeState.addAgent(1, 0, 0, undefined, true);

  const agent = officeState.characters.get(1);
  assert.ok(agent?.workSeatId, 'expected the agent to receive a work seat');

  agent!.state = CharacterState.IDLE;
  agent!.isActive = false;
  agent!.wanderCount = agent!.wanderLimit;
  agent!.wanderTimer = 0;

  officeState.update(0.1);

  const restSeatId = agent!.seatId;
  assert.ok(restSeatId, 'expected the agent to pick a seat for resting');
  assert.notEqual(restSeatId, agent!.workSeatId, 'expected the agent to leave their desk to rest');

  const restSeat = officeState.seats.get(restSeatId!);
  assert.ok(restSeat, 'expected the rest seat to exist');
  assert.equal(restSeat!.isWorkSeat, false, 'expected the rest seat to be in the lounge');
  assert.equal(agent!.state, CharacterState.WALK, 'expected the agent to walk toward lounge seating');
});

test('agents leave lounge seating and return to their workstation when activated again', () => {
  prepareCatalog();
  const layout = loadDefaultLayout();
  const officeState = new OfficeState(layout);

  officeState.addAgent(1, 0, 0, undefined, true);

  const agent = officeState.characters.get(1);
  assert.ok(agent?.workSeatId, 'expected the agent to receive a work seat');

  agent!.state = CharacterState.IDLE;
  agent!.isActive = false;
  agent!.wanderCount = agent!.wanderLimit;
  agent!.wanderTimer = 0;
  officeState.update(0.1);

  const loungeSeatId = agent!.seatId;
  assert.ok(loungeSeatId && loungeSeatId !== agent!.workSeatId, 'expected a temporary lounge seat');

  const loungeSeat = officeState.seats.get(loungeSeatId!);
  assert.ok(loungeSeat, 'expected the lounge seat to exist');

  for (let i = 0; i < 200; i++) {
    officeState.update(0.1);
    if (
      agent!.state === CharacterState.TYPE &&
      agent!.seatId === loungeSeatId &&
      agent!.tileCol === loungeSeat!.seatCol &&
      agent!.tileRow === loungeSeat!.seatRow
    ) {
      break;
    }
  }

  officeState.setAgentActive(1, true);

  assert.equal(agent!.seatId, agent!.workSeatId, 'expected activation to restore the work seat');
  assert.equal(
    officeState.seats.get(loungeSeatId!)?.assigned,
    false,
    'expected the temporary lounge seat to be released',
  );

  let reachedWorkSeat = false;
  const workSeat = officeState.seats.get(agent!.workSeatId!);
  assert.ok(workSeat, 'expected the work seat to exist');
  for (let i = 0; i < 200; i++) {
    officeState.update(0.1);
    if (agent!.tileCol === workSeat!.seatCol && agent!.tileRow === workSeat!.seatRow) {
      reachedWorkSeat = true;
      break;
    }
  }

  assert.ok(reachedWorkSeat, 'agent should head back to the workstation when work resumes');
});

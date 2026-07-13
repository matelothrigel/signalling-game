/**
 * SimulationCanvas — the SVG canvas that renders the
 * topology, signals, platforms, routes, and trains.
 *
 * The canvas is a **pure function of the snapshot**.
 * It reads the layout (computed once per topology
 * change and memoised) and every other piece of state
 * from the `SimulationSnapshot`. It does not call into
 * the engine, and it does not recompute the layout on
 * every render.
 *
 * Selection state lives in the canvas (local React
 * state) and is communicated to inspectors via
 * callbacks. Click handlers dispatch commands through
 * the store's `dispatch` action.
 */

import { useMemo, useCallback } from 'react';
import { useSimulationStore } from '@/store';
import { computeLayout, type NodePosition } from './layout/computeLayout';
import { EdgeGlyph } from './renderers/EdgeGlyph';
import { NodeGlyph } from './renderers/NodeGlyph';
import { SignalGlyph } from './renderers/SignalGlyph';
import { PlatformGlyph } from './renderers/PlatformGlyph';
import { TrainGlyph } from './renderers/TrainGlyph';
import { Camera } from './Camera';
import type {
  NodeId,
  SignalId,
  SwitchId,
  TrainId,
  EdgeId,
} from '@/types/ids';

/** What kind of entity the user has selected (if any). */
export type Selection =
  | { readonly kind: 'signal'; readonly id: SignalId }
  | { readonly kind: 'switch'; readonly id: SwitchId }
  | { readonly kind: 'train'; readonly id: TrainId }
  | null;

export type SelectionKind = NonNullable<Selection>['kind'];

export interface SimulationCanvasProps {
  readonly selection: Selection;
  readonly pendingRouteFrom: SignalId | null;
  readonly onSelect: (selection: Selection) => void;
}

export const SimulationCanvas = ({
  selection,
  pendingRouteFrom,
  onSelect,
}: SimulationCanvasProps): JSX.Element => {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const dispatch = useSimulationStore((s) => s.dispatch);

  const layout = useMemo(
    () => computeLayout(snapshot.topology),
    [snapshot.topology],
  );

  const edgeInActiveRoute = useMemo(() => {
    const set = new Set<string>();
    for (const r of snapshot.routes.values()) {
      if (!r.active) continue;
      for (const eid of r.edgeIds) set.add(eid as unknown as string);
    }
    return set;
  }, [snapshot.routes]);

  const edgeOccupied = useMemo(() => {
    const set = new Set<string>();
    for (const t of snapshot.trains.values()) {
      if (t.currentEdgeId !== null) {
        set.add(t.currentEdgeId as unknown as string);
      }
    }
    return set;
  }, [snapshot.trains]);

  const sectionPositions = useMemo(() => {
    return layout.nodes as unknown as ReadonlyMap<string, NodePosition>;
  }, [layout.nodes]);

  // Sections that belong to a platform already get a name via the
  // platform bar drawn above them. Also drawing the section's own
  // node label there just prints two labels on top of each other,
  // so we suppress the plain node label for those sections.
  const platformSectionIds = useMemo(() => {
    const set = new Set<string>();
    for (const platform of snapshot.platforms.values()) {
      for (const sid of platform.sectionIds) {
        set.add(sid as unknown as string);
      }
    }
    return set;
  }, [snapshot.platforms]);

  const handleSignalClick = useCallback(
    (signalId: SignalId) => {
      // If a route is being set (pendingRouteFrom is set),
      // dispatch SET_ROUTE and clear the pending state.
      if (pendingRouteFrom !== null) {
        dispatch({
          type: 'SET_ROUTE',
          origin: pendingRouteFrom,
          destination: signalId,
        });
        onSelect({ kind: 'signal', id: signalId });
        return;
      }
      onSelect({ kind: 'signal', id: signalId });
    },
    [pendingRouteFrom, dispatch, onSelect],
  );

  const handleNodeClick = useCallback(
    (id: NodeId) => {
      // Decide whether the click hit a switch or a
      // section. The snapshot's switch map is the
      // source of truth.
      if (snapshot.switches.has(id as never)) {
        onSelect({ kind: 'switch', id: id as unknown as SwitchId });
        return;
      }
      // Sections are not directly selectable in M1.
      void id;
    },
    [snapshot.switches, onSelect],
  );

  const handleTrainClick = useCallback(
    (id: TrainId) => {
      onSelect({ kind: 'train', id });
    },
    [onSelect],
  );

  const isSelected = useCallback(
    (kind: SelectionKind, id: string): boolean => {
      if (selection === null) return false;
      if (selection.kind !== kind) return false;
      return (selection.id as unknown as string) === id;
    },
    [selection],
  );

  return (
    <Camera width={layout.width} height={layout.height}>
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ display: 'block', background: 'transparent' }}
      >
        {/* Edges */}
        {snapshot.topology.edges.map((e) => {
          const layoutE = layout.edges.get(e.id as never);
          if (!layoutE) return null;
          const occupied = edgeOccupied.has(e.id as unknown as string);
          return (
            <EdgeGlyph
              key={e.id}
              layout={layoutE}
              inActiveRoute={edgeInActiveRoute.has(e.id as unknown as string)}
              signalAspect={null}
              occupied={occupied}
            />
          );
        })}

        {/* Nodes */}
        {snapshot.topology.nodes.map((n) => {
          const pos = layout.nodes.get(n.id as never);
          if (!pos) return null;
          const rawLabel =
            'label' in n ? (n as { label?: string }).label ?? undefined : undefined;
          const label = platformSectionIds.has(n.id as unknown as string)
            ? undefined
            : rawLabel;
          const isSel = isSelected('switch', n.id as unknown as string);
          if (n.kind === 'switch') {
            return (
              <g
                key={n.id}
                onClick={() => handleNodeClick(n.id as NodeId)}
                style={{ cursor: 'pointer' }}
              >
                <NodeGlyph
                  kind="switch"
                  position={pos}
                  switchState={snapshot.switches.get(n.id as never)}
                  label={label}
                  selected={isSel}
                />
              </g>
            );
          }
          return (
            <g
              key={n.id}
              onClick={() => handleNodeClick(n.id as NodeId)}
              style={{ cursor: 'pointer' }}
            >
              <NodeGlyph
                kind="section"
                position={pos}
                sectionState={snapshot.sections.get(n.id as never)}
                label={label}
                selected={false}
              />
            </g>
          );
        })}

        {/* Signals — drawn on top of nodes so the dot is visible */}
        {snapshot.topology.edges.map((e) => {
          if (!e.signalId) return null;
          const layoutE = layout.edges.get(e.id as never);
          if (!layoutE) return null;
          const signalState = snapshot.signals.get(e.signalId);
          if (!signalState) return null;
          const isPending = pendingRouteFrom === e.signalId;
          const isSel = isSelected('signal', e.signalId as unknown as string);
          return (
            <g key={e.signalId} opacity={isPending ? 0.5 : 1}>
              <SignalGlyph
                cx={layoutE.to.x}
                cy={layoutE.to.y}
                aspect={signalState.aspect}
                label={e.signalId as unknown as string}
                selected={isSel}
                onClick={() => handleSignalClick(e.signalId as SignalId)}
              />
            </g>
          );
        })}

        {/* Platforms */}
        {Array.from(snapshot.platforms.entries()).map(([pid, platform]) => {
          const occupied = Array.from(snapshot.trains.values()).some(
            (t) => t.heldAtPlatform === pid,
          );
          return (
            <PlatformGlyph
              key={pid}
              id={pid}
              platform={platform}
              sectionPositions={sectionPositions}
              occupied={occupied}
            />
          );
        })}

        {/* Trains — drawn last so they sit on top of everything */}
        {Array.from(snapshot.trains.values()).map((t) => {
          const isSel = isSelected('train', t.id as unknown as string);
          return (
            <g
              key={t.id}
              onClick={() => handleTrainClick(t.id as TrainId)}
              style={{ cursor: 'pointer' }}
            >
              <TrainGlyph
                train={{
                  ...t,
                  // Slight visual emphasis on the selected train.
                  currentEdgeId: t.currentEdgeId,
                }}
                edgeLayouts={
                  layout.edges as unknown as ReadonlyMap<
                    EdgeId,
                    { readonly from: NodePosition; readonly to: NodePosition }
                  >
                }
                label={
                  isSel
                    ? `${t.id as unknown as string} (selected)`
                    : (t.id as unknown as string)
                }
              />
            </g>
          );
        })}
      </svg>
    </Camera>
  );
};

<script lang="ts">
  import { untrack } from "svelte";
  import { Maximize2, Search, ZoomIn, ZoomOut } from "@lucide/svelte";
  import { fitView, type GraphPoint, type GraphView } from "./graph-layout";
  import {
    graphBounds,
    incidentEdgeIds,
    initialsOf,
    matchingNodeIds,
    neighbourIds,
    type RelationGraphEdge,
    type RelationGraphNode
  } from "./relation-graph-model";
  import type { PageKind, RelationType } from "./story-meta";

  type Props = {
    nodes: readonly RelationGraphNode[];
    edges: readonly RelationGraphEdge[];
    positions: Readonly<Record<string, GraphPoint>>;
    selectedId?: string | null;
    selectedEdgeId?: string | null;
    highlightIds?: readonly string[];
    dimOthers?: boolean;
    compact?: boolean;
    mode?: "chapter" | "all";
    onSelectNode: (id: string | null) => void;
    onSelectEdge: (id: string | null) => void;
    onMoveNode: (id: string, position: GraphPoint) => void;
    onOpenPage: (id: string) => void;
  };

  let {
    nodes,
    edges,
    positions,
    selectedId = null,
    selectedEdgeId = null,
    highlightIds = [],
    dimOthers = false,
    compact = false,
    mode = "chapter",
    onSelectNode,
    onSelectEdge,
    onMoveNode,
    onOpenPage
  }: Props = $props();

  const NODE_RADIUS = 26;
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 3;
  const MAP_WIDTH = 150;
  const MAP_HEIGHT = 100;

  const uid = $props.id();

  const kindColors: Record<PageKind, string> = {
    character: "var(--accent)",
    place: "var(--link)",
    organisation: "var(--warning)",
    item: "var(--quote)",
    other: "var(--text-muted)"
  };

  const relationColors: Record<RelationType, string> = {
    family: "var(--accent)",
    friend: "var(--success)",
    rival: "var(--danger)",
    love: "var(--quote)",
    mentor: "var(--link)",
    employer: "var(--warning)",
    other: "var(--text-muted)"
  };

  const kindNames: Record<PageKind, string> = {
    character: "Character",
    place: "Place",
    organisation: "Organisation",
    item: "Item",
    other: "Page"
  };

  let width = $state(0);
  let height = $state(0);
  let view = $state<GraphView>({ scale: 1, translate: { x: 0, y: 0 } });
  let query = $state("");
  let activeMatch = $state(0);
  let canvasElement: HTMLDivElement | null = $state(null);

  const matches = $derived(matchingNodeIds(nodes, query));
  const matchSet = $derived(new Set(matches));
  const neighbourSet = $derived(selectedId ? neighbourIds(edges, selectedId) : new Set<string>());

  const focusedEdgeIds = $derived.by(() => {
    if (selectedEdgeId) return new Set([selectedEdgeId]);
    if (selectedId) return incidentEdgeIds(edges, selectedId);
    return new Set<string>();
  });

  const focusIds = $derived.by(() => {
    const ids = new Set<string>(highlightIds);
    if (selectedId) {
      ids.add(selectedId);
      for (const id of neighbourSet) ids.add(id);
    }
    if (selectedEdgeId) {
      const edge = edges.find((candidate) => candidate.id === selectedEdgeId);
      if (edge) {
        ids.add(edge.from);
        ids.add(edge.to);
      }
    }
    return ids;
  });

  const hasFocus = $derived(selectedId !== null || selectedEdgeId !== null || highlightIds.length > 0);

  const nodeViews = $derived(
    nodes.map((node) => {
      const point = positions[node.id];
      const degree = edges.filter((edge) => edge.from === node.id || edge.to === node.id).length;
      return {
        ...node,
        x: point?.x ?? 0,
        y: point?.y ?? 0,
        short: shortLabel(node.label),
        degree,
        dimmed: dimOthers && hasFocus && !focusIds.has(node.id),
        neighbour: neighbourSet.has(node.id)
      };
    })
  );

  const edgeViews = $derived.by(() =>
    edges.map((edge) => {
      const from = positions[edge.from] ?? { x: 0, y: 0 };
      const to = positions[edge.to] ?? { x: 0, y: 0 };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      const offset = edge.lane * 9;
      const x1 = from.x + ux * NODE_RADIUS - uy * offset;
      const y1 = from.y + uy * NODE_RADIUS + ux * offset;
      const x2 = to.x - ux * (NODE_RADIUS + 4) - uy * offset;
      const y2 = to.y - uy * (NODE_RADIUS + 4) + ux * offset;
      const midX = (x1 + x2) / 2 - uy * 9;
      const midY = (y1 + y2) / 2 + ux * 9;
      const fromLabel = nodes.find((node) => node.id === edge.from)?.label ?? edge.from;
      const toLabel = nodes.find((node) => node.id === edge.to)?.label ?? edge.to;
      const count = edge.count ?? 0;
      const badgeText = `${count} ${count === 1 ? "scene" : "scenes"}`;
      return {
        edge,
        x1,
        y1,
        x2,
        y2,
        midX,
        midY,
        fromLabel,
        toLabel,
        badgeText,
        badgeWidth: badgeText.length * 3.6 + 10,
        dimmed: dimOthers && hasFocus && !focusedEdgeIds.has(edge.id)
          && !(focusIds.has(edge.from) && focusIds.has(edge.to)),
        adjacent: !selectedEdgeId && selectedId !== null && (edge.from === selectedId || edge.to === selectedId),
        labelText:
          edge.status === "declared"
            ? edge.label.length > 18
              ? `${edge.label.slice(0, 17)}…`
              : edge.label
            : ""
      };
    })
  );

  const bounds = $derived(graphBounds(nodeViews.map((node) => ({ x: node.x, y: node.y }))));

  const minimap = $derived.by(() => {
    const padding = 8;
    const left = bounds.x - NODE_RADIUS;
    const top = bounds.y - NODE_RADIUS;
    const boxWidth = Math.max(bounds.width + NODE_RADIUS * 2, 1);
    const boxHeight = Math.max(bounds.height + NODE_RADIUS * 2, 1);
    const scale = Math.min((MAP_WIDTH - padding * 2) / boxWidth, (MAP_HEIGHT - padding * 2) / boxHeight);
    return {
      scale,
      offsetX: MAP_WIDTH / 2 - (left + boxWidth / 2) * scale,
      offsetY: MAP_HEIGHT / 2 - (top + boxHeight / 2) * scale
    };
  });

  const viewportRect = $derived({
    x: minimap.offsetX + (-view.translate.x / view.scale) * minimap.scale,
    y: minimap.offsetY + (-view.translate.y / view.scale) * minimap.scale,
    width: Math.max((width / view.scale) * minimap.scale, 3),
    height: Math.max((height / view.scale) * minimap.scale, 3)
  });

  const showMinimap = $derived(
    nodes.length > 0 &&
      width > 0 &&
      height > 0 &&
      (mode === "all" ||
        bounds.width * view.scale > width - 24 ||
        bounds.height * view.scale > height - 24)
  );

  const graphLabel = $derived(
    `Relationship network of ${nodes.length} ${nodes.length === 1 ? "page" : "pages"} and ${edges.length} ${
      edges.length === 1 ? "link" : "links"
    }. Tab steps through pages, Enter selects, arrow keys pan.`
  );

  // Positions of pages hidden by the chapter filter are kept for stability but must not shape the fit.
  const visiblePositions = $derived(
    Object.fromEntries(nodes.filter((node) => positions[node.id]).map((node) => [node.id, positions[node.id]]))
  );

  let lastFitKey = "";
  $effect(() => {
    const key = `${nodes.map((node) => node.id).join("\u0000")}:${Object.keys(visiblePositions).length}:${Math.round(width)}:${Math.round(height)}`;
    if (!width || !height || key === lastFitKey) return;
    lastFitKey = key;
    view = untrack(() => fitView(visiblePositions, { width, height }, 76));
  });

  function shortLabel(label: string, max = 20): string {
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function centreOn(id: string) {
    const point = positions[id];
    if (!point || !width || !height) return;
    view = {
      scale: view.scale,
      translate: { x: width / 2 - point.x * view.scale, y: height / 2 - point.y * view.scale }
    };
  }

  function zoomAt(point: GraphPoint, factor: number) {
    const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    if (scale === view.scale) return;
    const worldX = (point.x - view.translate.x) / view.scale;
    const worldY = (point.y - view.translate.y) / view.scale;
    view = {
      scale,
      translate: { x: point.x - worldX * scale, y: point.y - worldY * scale }
    };
  }

  function zoomBy(factor: number) {
    zoomAt({ x: width / 2, y: height / 2 }, factor);
  }

  function fitGraph() {
    if (!width || !height) return;
    view = fitView(visiblePositions, { width, height }, 76);
  }

  function wheelZoom(node: SVGSVGElement) {
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      zoomAt(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        Math.exp(-event.deltaY * 0.0015)
      );
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return {
      destroy() {
        node.removeEventListener("wheel", onWheel);
      }
    };
  }

  type Gesture =
    | {
        kind: "node";
        pointerId: number;
        id: string;
        startX: number;
        startY: number;
        origin: GraphPoint;
        moved: boolean;
      }
    | {
        kind: "pan";
        pointerId: number;
        startX: number;
        startY: number;
        origin: GraphPoint;
        moved: boolean;
        fromEdge: boolean;
      };

  type Pinch = {
    first: number;
    second: number;
    distance: number;
    midpoint: GraphPoint;
    scale: number;
    translate: GraphPoint;
  };

  const pointers = new Map<number, GraphPoint>();
  let gesture: Gesture | null = null;
  let pinch: Pinch | null = null;
  /** What the current press landed on; pointer capture retargets the following click to the canvas. */
  let press: {
    nodeId: string | null;
    edgeId: string | null;
    startX: number;
    startY: number;
    moved: boolean;
    at: number;
  } | null = null;

  function pointerPoint(event: PointerEvent): GraphPoint {
    const rect = canvasElement?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  function midpoint(first: GraphPoint, second: GraphPoint): GraphPoint {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  function startPinch() {
    const [firstEntry, secondEntry] = pointers.entries();
    if (!firstEntry || !secondEntry) return;
    const [firstId, first] = firstEntry;
    const [secondId, second] = secondEntry;
    pinch = {
      first: firstId,
      second: secondId,
      distance: Math.hypot(second.x - first.x, second.y - first.y) || 1,
      midpoint: midpoint(first, second),
      scale: view.scale,
      translate: { ...view.translate }
    };
    gesture = null;
  }

  function updatePinch() {
    if (!pinch) return;
    const first = pointers.get(pinch.first);
    const second = pointers.get(pinch.second);
    if (!first || !second) return;
    const distance = Math.hypot(second.x - first.x, second.y - first.y) || 1;
    const centre = midpoint(first, second);
    const scale = clamp((pinch.scale * distance) / pinch.distance, MIN_SCALE, MAX_SCALE);
    const worldX = (pinch.midpoint.x - pinch.translate.x) / pinch.scale;
    const worldY = (pinch.midpoint.y - pinch.translate.y) / pinch.scale;
    view = {
      scale,
      translate: { x: centre.x - worldX * scale, y: centre.y - worldY * scale }
    };
  }

  function onPointerDown(event: PointerEvent) {
    if (!canvasElement) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, pointerPoint(event));
    press = null;
    try {
      if (!canvasElement.hasPointerCapture(event.pointerId)) {
        canvasElement.setPointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture is unavailable in some environments; click handling below selects instead.
    }

    if (pointers.size === 2) {
      startPinch();
      return;
    }
    if (pointers.size > 2) return;

    const target = event.target instanceof Element ? event.target : null;
    const nodeElement = target?.closest("[data-graph-node]");
    let fromEdge = false;

    if (nodeElement) {
      const id = nodeElement.getAttribute("data-graph-node");
      if (!id) return;
      gesture = {
        kind: "node",
        pointerId: event.pointerId,
        id,
        startX: event.clientX,
        startY: event.clientY,
        origin: positions[id] ?? { x: 0, y: 0 },
        moved: false
      };
      press = {
        nodeId: id,
        edgeId: null,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        at: Date.now()
      };
      onSelectNode(id);
      onSelectEdge(null);
    } else {
      const edgeElement = target?.closest("[data-graph-edge]");
      const edgeId = edgeElement?.getAttribute("data-graph-edge") ?? null;
      if (edgeId) {
        onSelectEdge(edgeId);
        onSelectNode(null);
        fromEdge = true;
      }
      press = {
        nodeId: null,
        edgeId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        at: Date.now()
      };
      gesture = {
        kind: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: { ...view.translate },
        moved: false,
        fromEdge
      };
    }

    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, pointerPoint(event));

    if (pinch) {
      updatePinch();
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) > 3) gesture.moved = true;
    if (press && !press.moved && Math.hypot(dx, dy) > 4) press.moved = true;

    if (gesture.kind === "node") {
      onMoveNode(gesture.id, {
        x: gesture.origin.x + dx / view.scale,
        y: gesture.origin.y + dy / view.scale
      });
    } else {
      view = {
        scale: view.scale,
        translate: { x: gesture.origin.x + dx, y: gesture.origin.y + dy }
      };
    }
  }

  function endPointer(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (canvasElement?.hasPointerCapture(event.pointerId)) {
      canvasElement.releasePointerCapture(event.pointerId);
    }

    if (pinch) {
      if (!pointers.has(pinch.first) || !pointers.has(pinch.second)) pinch = null;
      return;
    }

    if (gesture && gesture.pointerId === event.pointerId) {
      if (gesture.kind === "pan" && !gesture.moved && !gesture.fromEdge) {
        onSelectNode(null);
        onSelectEdge(null);
      }
      gesture = null;
    }
  }

  /**
   * Click fallback for environments where pointer capture retargets (or never delivers) the
   * selection done in onPointerDown. A press that dragged is not a click.
   */
  function onGraphClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const nodeId = target?.closest("[data-graph-node]")?.getAttribute("data-graph-node") ?? null;
    const edgeId = target?.closest("[data-graph-edge]")?.getAttribute("data-graph-edge") ?? null;
    const fallback = !nodeId && !edgeId ? press : null;
    if (fallback?.moved) return;

    const hitNode = nodeId ?? fallback?.nodeId ?? null;
    const hitEdge = hitNode ? null : (edgeId ?? fallback?.edgeId ?? null);

    if (hitNode) {
      if (hitNode === selectedId && selectedEdgeId === null) return;
      onSelectNode(hitNode);
      onSelectEdge(null);
      return;
    }
    if (hitEdge) {
      if (hitEdge === selectedEdgeId && selectedId === null) return;
      onSelectEdge(hitEdge);
      onSelectNode(null);
      return;
    }
    if (selectedId === null && selectedEdgeId === null) return;
    onSelectNode(null);
    onSelectEdge(null);
  }

  function onGraphDoubleClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const nodeId =
      target?.closest("[data-graph-node]")?.getAttribute("data-graph-node") ??
      press?.nodeId ??
      null;
    if (!nodeId) return;
    event.preventDefault();
    onOpenPage(nodeId);
  }

  function clearSearch() {
    query = "";
    activeMatch = 0;
  }

  function onSearchInput(value: string) {
    query = value;
    activeMatch = 0;
    const first = matchingNodeIds(nodes, value)[0];
    if (first) centreOn(first);
  }

  function onSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      clearSearch();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const ids = matchingNodeIds(nodes, query);
    if (ids.length === 0) return;
    const index = activeMatch % ids.length;
    centreOn(ids[index]);
    onSelectNode(ids[index]);
    onSelectEdge(null);
    activeMatch = (index + 1) % ids.length;
  }

  function onGraphKeydown(event: KeyboardEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const nodeElement = target?.closest("[data-graph-node]");

    if (nodeElement && (event.key === "Enter" || event.key === " ")) {
      const id = nodeElement.getAttribute("data-graph-node");
      if (id) {
        event.preventDefault();
        onSelectNode(id);
        onSelectEdge(null);
      }
      return;
    }

    const step = event.shiftKey ? 160 : 48;
    switch (event.key) {
      case "ArrowLeft":
        view = { scale: view.scale, translate: { ...view.translate, x: view.translate.x + step } };
        break;
      case "ArrowRight":
        view = { scale: view.scale, translate: { ...view.translate, x: view.translate.x - step } };
        break;
      case "ArrowUp":
        view = { scale: view.scale, translate: { ...view.translate, y: view.translate.y + step } };
        break;
      case "ArrowDown":
        view = { scale: view.scale, translate: { ...view.translate, y: view.translate.y - step } };
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function edgeAriaLabel(
    edge: RelationGraphEdge,
    fromLabel: string,
    toLabel: string,
    count: number
  ): string {
    if (edge.status === "suggested") {
      return `Suggested relation between ${fromLabel} and ${toLabel}, ${count} ${
        count === 1 ? "scene" : "scenes"
      } together. Select to review.`;
    }
    const type = edge.label || edge.type;
    return `${fromLabel}, ${type}, ${toLabel}. Select to edit.`;
  }
</script>

<div class="relation-graph" class:is-all={mode === "all"} class:compact={compact}>
  <div class="graph-toolbar">
    <div class="graph-search">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={query}
        placeholder="Find a page…"
        aria-label="Search pages in the network"
        oninput={(event) => onSearchInput(event.currentTarget.value)}
        onkeydown={onSearchKeydown}
      />
      {#if query}
        <button
          type="button"
          class="graph-search-clear"
          aria-label="Clear search"
          onclick={clearSearch}
        >
          ×
        </button>
      {/if}
    </div>
    <span class="graph-meta">{nodes.length} pages · {edges.length} links</span>
    <span class="graph-mode">{mode === "all" ? "All pages" : "This chapter"}</span>
    <div class="graph-actions">
      <span class="graph-zoom" aria-hidden="true">{Math.round(view.scale * 100)}%</span>
      <button
        type="button"
        class="graph-button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={view.scale <= MIN_SCALE}
        onclick={() => zoomBy(1 / 1.25)}
      >
        <ZoomOut size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        class="graph-button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={view.scale >= MAX_SCALE}
        onclick={() => zoomBy(1.25)}
      >
        <ZoomIn size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        class="graph-button"
        aria-label="Fit graph to view"
        title="Fit graph to view"
        onclick={fitGraph}
      >
        <Maximize2 size={15} aria-hidden="true" />
      </button>
    </div>
  </div>

  <!-- The graph canvas is an ARIA application: it handles pan/zoom keys and contains focusable nodes. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="graph-canvas"
    bind:this={canvasElement}
    role="application"
    tabindex="0"
    aria-label={graphLabel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={endPointer}
    onpointercancel={endPointer}
    onclick={onGraphClick}
    ondblclick={onGraphDoubleClick}
    onkeydown={onGraphKeydown}
  >
    <svg
      bind:clientWidth={width}
      bind:clientHeight={height}
      viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`}
      class="graph-svg"
      use:wheelZoom
    >
      <title>Relationship network</title>
      <defs>
        {#each Object.entries(relationColors) as [type, color] (type)}
          <marker
            id={`${uid}-arrow-${type}`}
            viewBox="0 0 9 9"
            refX="8.5"
            refY="4.5"
            markerWidth="9"
            markerHeight="9"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0 0 L9 4.5 L0 9 Z" fill={color} />
          </marker>
        {/each}
      </defs>

      <g class="graph-viewport" transform={`translate(${view.translate.x} ${view.translate.y}) scale(${view.scale})`}>
      <g class="graph-edges">
        {#each edgeViews as item (item.edge.id)}
          <g
            class="edge"
            class:suggested={item.edge.status === "suggested"}
            class:selected={item.edge.id === selectedEdgeId}
            class:dimmed={item.dimmed}
            class:adjacent={item.adjacent}
            data-graph-edge={item.edge.id}
            role="button"
            tabindex="-1"
            aria-label={edgeAriaLabel(item.edge, item.fromLabel, item.toLabel, item.edge.count ?? 0)}
          >
            {#if item.edge.id === selectedEdgeId}
              <line
                class="edge-halo"
                x1={item.x1}
                y1={item.y1}
                x2={item.x2}
                y2={item.y2}
                stroke={item.edge.status === "suggested" ? "var(--text-faint)" : relationColors[item.edge.type]}
              />
            {/if}
            <line
              class="edge-line"
              x1={item.x1}
              y1={item.y1}
              x2={item.x2}
              y2={item.y2}
              stroke={item.edge.status === "suggested" ? "var(--text-faint)" : relationColors[item.edge.type]}
              marker-end={item.edge.status === "declared"
                ? `url(#${uid}-arrow-${item.edge.type})`
                : undefined}
            />
            <line
              class="edge-hit"
              x1={item.x1}
              y1={item.y1}
              x2={item.x2}
              y2={item.y2}
            />
            {#if item.edge.status === "declared" && item.labelText}
              <text class="edge-label" x={item.midX} y={item.midY} fill={relationColors[item.edge.type]}>
                {item.labelText}
              </text>
            {:else if item.edge.status === "suggested"}
              <g class="edge-badge">
                <rect
                  x={item.midX - item.badgeWidth / 2}
                  y={item.midY - 6}
                  width={item.badgeWidth}
                  height={12}
                  rx="6"
                />
                <text x={item.midX} y={item.midY + 2.6}>{item.badgeText}</text>
              </g>
            {/if}
          </g>
        {/each}
      </g>

      <g class="graph-nodes">
        {#each nodeViews as node (node.id)}
          <g
            class="node"
            class:selected={node.id === selectedId}
            class:neighbour={node.neighbour}
            class:dimmed={node.dimmed}
            class:match={matchSet.has(node.id)}
            class:highlighted={highlightIds.includes(node.id)}
            data-graph-node={node.id}
            transform={`translate(${node.x} ${node.y})`}
            role="button"
            tabindex="0"
            aria-pressed={node.id === selectedId}
            aria-label={`${node.label}, ${kindNames[node.kind]}, ${node.degree} ${
              node.degree === 1 ? "link" : "links"
            }`}
            style={`--node-color: ${kindColors[node.kind]}`}
          >
            <title>{node.label}</title>
            <circle class="node-focus" r={NODE_RADIUS + 5} />
            {#if node.id === selectedId}
              <circle class="node-halo" r={NODE_RADIUS + 6} />
            {/if}
            {#if matchSet.has(node.id)}
              <circle class="node-match" r={NODE_RADIUS + 4} />
            {/if}
            <circle class="node-circle" r={NODE_RADIUS} />
            <text class="node-initials" y="1">{node.initials || initialsOf(node.label)}</text>
            <text class="node-label" y={NODE_RADIUS + 15}>{node.short}</text>
          </g>
        {/each}
      </g>
      </g>
    </svg>

    {#if showMinimap}
      <svg
        class="graph-minimap"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        aria-hidden="true"
      >
        <rect class="minimap-bg" x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} rx="8" />
        {#each nodeViews as node (node.id)}
          <circle
            cx={node.x * minimap.scale + minimap.offsetX}
            cy={node.y * minimap.scale + minimap.offsetY}
            r={node.id === selectedId ? 3.4 : 2.2}
            fill={kindColors[node.kind]}
            opacity={node.id === selectedId ? 1 : 0.75}
          />
        {/each}
        <rect
          class="minimap-viewport"
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          rx="2"
        />
      </svg>
    {/if}

    {#if nodeViews.length === 0}
      <p class="graph-empty">No pages match this view.</p>
    {/if}

    <p class="graph-hint" aria-hidden="true">Drag to move · Scroll to zoom</p>
  </div>
</div>

<style>
  .relation-graph {
    display: flex;
    flex-direction: column;
    min-height: 360px;
    height: min(70vh, 680px);
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    overflow: hidden;
  }

  .relation-graph.compact {
    min-height: 0;
    height: 100%;
    border: 0;
    border-radius: 0;
  }

  .graph-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border-soft);
    background: var(--surface-raised);
    flex: 0 0 auto;
  }

  .graph-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 28px;
    border: 1px solid var(--border-control);
    border-radius: 7px;
    background: var(--control-bg);
    color: var(--text-muted);
    min-width: 180px;
    flex: 0 1 260px;
  }

  .graph-search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-ring);
  }

  .graph-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font-size: 12px;
    outline: none;
  }

  .graph-search input::placeholder {
    color: var(--text-faint);
  }

  .graph-search input::-webkit-search-cancel-button {
    display: none;
  }

  .graph-search-clear {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }

  .graph-search-clear:hover {
    color: var(--text-primary);
  }

  .graph-meta,
  .graph-mode,
  .graph-zoom {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .graph-mode {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 600;
  }

  .graph-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .graph-zoom {
    min-width: 34px;
    text-align: right;
    margin-right: 4px;
  }

  .graph-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--border-control);
    border-radius: 6px;
    background: var(--control-bg);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .graph-button:hover:not(:disabled) {
    background: var(--control-hover);
    color: var(--text-primary);
  }

  .graph-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .graph-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .graph-canvas {
    position: relative;
    flex: 1;
    min-height: 0;
    outline: none;
    touch-action: none;
    background-color: var(--surface);
    background-image: radial-gradient(circle, var(--border-soft) 1px, transparent 1px);
    background-size: 22px 22px;
  }

  .graph-canvas:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent-ring);
  }

  .graph-svg {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
    outline: none;
    user-select: none;
  }

  .graph-svg:active {
    cursor: grabbing;
  }

  .graph-hint,
  .graph-empty {
    position: absolute;
    margin: 0;
    font-size: 11px;
    color: var(--text-faint);
    pointer-events: none;
  }

  .graph-hint {
    left: 12px;
    bottom: 10px;
  }

  .graph-empty {
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
  }

  .edge-line {
    stroke-width: 1.6;
    fill: none;
    transition: opacity 0.15s ease;
  }

  .edge.suggested .edge-line {
    stroke-width: 1.3;
    stroke-dasharray: 2 5;
    stroke-linecap: round;
  }

  .edge.selected .edge-line {
    stroke-width: 2.8;
  }

  .edge.adjacent .edge-line {
    stroke-width: 2.2;
  }

  .edge-halo {
    stroke-width: 7;
    stroke-opacity: 0.18;
    fill: none;
    stroke-linecap: round;
  }

  .edge-hit {
    stroke: transparent;
    stroke-width: 12;
    fill: none;
    pointer-events: stroke;
    cursor: pointer;
  }

  .edge.dimmed {
    opacity: 0.14;
  }

  .edge-label {
    font-size: 7.5px;
    text-anchor: middle;
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 2.4px;
    stroke-linejoin: round;
    pointer-events: auto;
    cursor: pointer;
  }

  .edge-badge rect {
    fill: var(--surface-raised);
    stroke: var(--border-control);
    stroke-width: 0.8;
  }

  .edge-badge text {
    font-size: 7px;
    text-anchor: middle;
    fill: var(--text-muted);
    pointer-events: none;
  }

  .node {
    cursor: grab;
    outline: none;
    transition: opacity 0.15s ease;
  }

  .node:active {
    cursor: grabbing;
  }

  .node-circle {
    fill: var(--surface-raised);
    stroke: var(--node-color);
    stroke-width: 1.8;
    transition:
      stroke-width 0.15s ease,
      fill 0.15s ease;
  }

  .node:hover .node-circle {
    stroke-width: 2.8;
    fill: var(--hover-bg);
  }

  .node-initials {
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-anchor: middle;
    dominant-baseline: middle;
    fill: var(--node-color);
    pointer-events: none;
  }

  .node-label {
    font-size: 9.5px;
    text-anchor: middle;
    fill: var(--text-body);
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 2.4px;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .node.selected .node-label {
    fill: var(--text-heading);
    font-weight: 600;
  }

  .node.neighbour .node-label {
    fill: var(--text-primary);
  }

  .node-halo {
    fill: none;
    stroke: var(--node-color);
    stroke-width: 2;
    stroke-opacity: 0.55;
  }

  .node-match {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.6;
    stroke-dasharray: 3 3;
  }

  .node.highlighted .node-circle {
    stroke-dasharray: 4 2;
  }

  .node-focus {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 2 3;
    opacity: 0;
  }

  .node:focus-visible .node-focus {
    opacity: 1;
  }

  .node.dimmed {
    opacity: 0.18;
  }

  .graph-minimap {
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: 150px;
    height: 100px;
    pointer-events: none;
  }

  .minimap-bg {
    fill: var(--surface-raised);
    stroke: var(--border-control);
    stroke-width: 1;
    opacity: 0.94;
  }

  .minimap-viewport {
    fill: var(--accent-soft);
    fill-opacity: 0.16;
    stroke: var(--accent);
    stroke-width: 1.2;
  }
</style>

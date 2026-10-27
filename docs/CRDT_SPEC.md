# SyncLoom CRDT Specification

This document details the mathematical rules and algorithms used by SyncLoom to resolve concurrent offline edits deterministically.

## 1. Hybrid Logical Clocks (HLC)

A Hybrid Logical Clock combines physical wall time with Lamport logical counters. It satisfies the strict causality condition: if event $e_1$ happened before $e_2$ ($e_1 \to e_2$), then $\text{HLC}(e_1) < \text{HLC}(e_2)$.

### Tuple Definition
A timestamp $T$ is defined as:

$$T = (l, c, n)$$

Where:
- $l \in \mathbb{N}$: Physical time in milliseconds (Unix epoch).
- $c \in \mathbb{N}$: Logical counter within the millisecond.
- $n \in \text{String}$: Unique node or client identifier.

### Total Ordering
For two timestamps $T_1 = (l_1, c_1, n_1)$ and $T_2 = (l_2, c_2, n_2)$:

$$T_1 < T_2 \iff (l_1 < l_2) \lor (l_1 = l_2 \land c_1 < c_2) \lor (l_1 = l_2 \land c_1 = c_2 \land n_1 < n_2)$$

This guarantees a strict, deterministic total order with zero ties.

### Clock Tick (Local Event)
When a local mutation occurs on node $n$, with physical clock reading $pt$:

1. If $pt > l$:
   $$l := pt, \quad c := 0$$
2. If $pt \le l$:
   $$c := c + 1$$

### Clock Update (Message Reception)
When node $n$ receives a message with timestamp $T_m = (l_m, c_m, n_m)$, with physical clock reading $pt$:

1. Compute maximum physical reference:
   $$l' := \max(l, pt, l_m)$$
2. Update counter:
   - If $l' = l = l_m$: $c := \max(c, c_m) + 1$
   - Else if $l' = l$: $c := c + 1$
   - Else if $l' = l_m$: $c := c_m + 1$
   - Else: $c := 0$
3. Assign physical time:
   $$l := l'$$

## 2. Field-Level Last-Write-Wins (LWW) Register

Traditional row-level sync overwrites entire records. SyncLoom implements field-level LWW registers: each column tracks its own modification timestamp.

### Column Metadata Structure
Each row maintains a metadata mapping $M$:

$$M = \{ \text{column}_i \mapsto T_i \}$$

### Merge Algorithm
Given an existing row state $(V_{\text{local}}, M_{\text{local}})$ and an incoming delta $(V_{\text{in}}, M_{\text{in}})$:

For each column $k \in \text{keys}(V_{\text{in}})$:
- Let $T_{\text{in}} = M_{\text{in}}[k]$
- Let $T_{\text{local}} = M_{\text{local}}[k]$
- If $T_{\text{in}} > T_{\text{local}}$:
  $$V_{\text{local}}[k] := V_{\text{in}}[k], \quad M_{\text{local}}[k] := T_{\text{in}}$$
- If $T_{\text{in}} < T_{\text{local}}$:
  Retain local value (ignore stale update).
- If $T_{\text{in}} = T_{\text{local}}$:
  Tie breaker: lexicographical comparison of string values.

### Non-Conflicting Merge Example
- User A modifies `status = "done"` at $T_A$.
- User B modifies `assignee = "Elena"` at $T_B$.
- Both columns have independent timestamps. When merged, the resulting row contains both `status = "done"` and `assignee = "Elena"`. No data is lost.

## 3. Deletions and Resurrection Semantics

SyncLoom handles deletions using tombstones:
1. Deleting a row sets `deleted = true` with timestamp $T_{\text{del}}$.
2. Stale updates where $T_{\text{update}} \le T_{\text{del}}$ are ignored.
3. If an edit arrives with $T_{\text{update}} > T_{\text{del}}$, the row is resurrected with the new field values.
4. Tombstones are garbage collected after a configurable retention window (default 30 days).

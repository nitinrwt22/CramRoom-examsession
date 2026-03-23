---
session_tags: [operating-systems, scheduling, cpu]
type: notes
topic: CPU Scheduling
difficulty: medium
created: 2026-03-23
---

# CPU Scheduling

CPU Scheduling is the process by which the OS determines which process runs at any given time.
The scheduler selects among ready processes and allocates the CPU to one of them.

## Key Scheduling Criteria

- **CPU Utilization** — Keep the CPU busy 100% of the time (realistically 40–90%)
- **Throughput** — Number of processes completed per time unit
- **Turnaround Time** — Time from submission to completion: `TAT = Completion - Arrival`
- **Waiting Time** — Time spent in the ready queue: `WT = TAT - Burst Time`
- **Response Time** — Time from submission to first response (important for interactive systems)

Optimization goal: maximize CPU utilization and throughput; minimize turnaround, waiting, and response time.

## FCFS — First Come First Served

Non-preemptive. Processes execute in arrival order.

**Example:**

| Process | Arrival | Burst |
|---------|---------|-------|
| P1      | 0       | 8     |
| P2      | 1       | 4     |
| P3      | 2       | 2     |

Gantt: `P1(0–8) → P2(8–12) → P3(12–14)`

- Avg WT = (0 + 7 + 10) / 3 = **5.67 ms**
- **Convoy effect**: short processes wait behind long ones → poor throughput

## SJF — Shortest Job First

Selects process with smallest burst time. Provably optimal for average waiting time.

- **Non-preemptive SJF**: Once CPU is given, process runs to completion
- **Preemptive SJF (SRTF)**: If new process arrives with shorter remaining time, it preempts

**SRTF Example** (same as above):

Gantt: `P1(0–1) → P3(1–3) → P2(3–7) → P1(7–14)`

⚠ Drawback: **Starvation** — long processes may wait indefinitely if short ones keep arriving.

## Round Robin (RR)

Preemptive. Each process gets a fixed **time quantum (q)**, then is placed at the back of the queue.

- **Large q**: degenerates to FCFS
- **Small q**: high context-switch overhead
- **Rule of thumb**: 80% of CPU bursts should be shorter than q

Avg response time is better than SJF for interactive systems.

## Priority Scheduling

Each process gets a priority number; CPU assigned to highest priority process.

- Can be preemptive or non-preemptive
- `SJF is priority scheduling where priority = 1/burst_time`
- **Problem**: Starvation of low-priority processes
- **Solution**: Aging — gradually increase priority of waiting processes

## Multilevel Queue Scheduling

Processes divided into groups (e.g., foreground/background), each with its own queue and scheduling algorithm.

- **Multilevel Queue**: fixed partition; process stays in its queue
- **Multilevel Feedback Queue**: processes can move between queues based on CPU burst behavior

This is the most general and flexible scheduler; used in most modern operating systems.

## Key Formulas (Exam Ready)

```
Turnaround Time (TAT) = Completion Time - Arrival Time
Waiting Time (WT)     = TAT - Burst Time
Response Time (RT)    = First Response - Arrival Time
CPU Utilization       = (Busy Time / Total Time) × 100%
Throughput            = # processes / time unit
```

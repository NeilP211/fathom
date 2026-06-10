import { describe, it, expect } from 'vitest'
import { WorkerPool } from '../src/world/workerPool.js'

function makeFakeWorker() {
  const w = {
    postMessage(msg) {
      // echo back asynchronously, like a real worker
      setTimeout(() => w.onmessage({ data: { jobId: msg.jobId, echoed: msg.value * 2 } }), 0)
    },
    onmessage: null,
    terminate() {},
  }
  return w
}

describe('WorkerPool', () => {
  it('resolves jobs with matching jobIds across workers', async () => {
    const pool = new WorkerPool(3, makeFakeWorker)
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7].map((value) => pool.run({ value })),
    )
    expect(results.map((r) => r.echoed)).toEqual([2, 4, 6, 8, 10, 12, 14])
    expect(pool.pending).toBe(0)
    pool.dispose()
  })

  it('tracks pending count while jobs are in flight', async () => {
    const pool = new WorkerPool(1, makeFakeWorker)
    const p1 = pool.run({ value: 1 })
    const p2 = pool.run({ value: 2 })
    expect(pool.pending).toBe(2)
    await Promise.all([p1, p2])
    expect(pool.pending).toBe(0)
    pool.dispose()
  })
})

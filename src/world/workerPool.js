export class WorkerPool {
  constructor(size, makeWorker) {
    this.workers = []
    this.jobs = new Map() // jobId -> { resolve, reject, workerIndex }
    this.nextJobId = 1
    this.nextWorker = 0
    for (let i = 0; i < size; i++) {
      const w = makeWorker()
      w.onmessage = (e) => {
        const job = this.jobs.get(e.data.jobId)
        if (job) {
          this.jobs.delete(e.data.jobId)
          job.resolve(e.data)
        }
      }
      // A worker that throws or fails to load would otherwise strand its jobs
      // forever (review finding): reject everything assigned to it so callers
      // can retry on a later frame.
      w.onerror = w.onmessageerror = (err) => {
        for (const [jobId, job] of this.jobs) {
          if (job.workerIndex !== i) continue
          this.jobs.delete(jobId)
          job.reject(new Error(`worker ${i} failed: ${err?.message || 'unknown error'}`))
        }
      }
      this.workers.push(w)
    }
  }

  get pending() {
    return this.jobs.size
  }

  run(msg, transfer = []) {
    const jobId = this.nextJobId++
    const workerIndex = this.nextWorker
    this.nextWorker = (this.nextWorker + 1) % this.workers.length
    return new Promise((resolve, reject) => {
      this.jobs.set(jobId, { resolve, reject, workerIndex })
      this.workers[workerIndex].postMessage({ ...msg, jobId }, transfer)
    })
  }

  dispose() {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.jobs.clear()
  }
}

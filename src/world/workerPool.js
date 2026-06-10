export class WorkerPool {
  constructor(size, makeWorker) {
    this.workers = []
    this.jobs = new Map() // jobId -> resolve
    this.nextJobId = 1
    this.nextWorker = 0
    for (let i = 0; i < size; i++) {
      const w = makeWorker()
      w.onmessage = (e) => {
        const resolve = this.jobs.get(e.data.jobId)
        if (resolve) {
          this.jobs.delete(e.data.jobId)
          resolve(e.data)
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
    return new Promise((resolve) => {
      this.jobs.set(jobId, resolve)
      const w = this.workers[this.nextWorker]
      this.nextWorker = (this.nextWorker + 1) % this.workers.length
      w.postMessage({ ...msg, jobId }, transfer)
    })
  }

  dispose() {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.jobs.clear()
  }
}

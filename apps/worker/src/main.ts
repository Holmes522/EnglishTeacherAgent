export function startWorker(): void {
  console.info("English Teacher worker is ready for configured jobs.");
}

if (process.env.NODE_ENV !== "test") {
  startWorker();
}


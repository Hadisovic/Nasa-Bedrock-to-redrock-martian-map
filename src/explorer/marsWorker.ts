let registration: Promise<ServiceWorkerRegistration> | null = null;

export function marsWorker() {
  return registration ??= navigator.serviceWorker.register("./mars-offline.js")
    .then(() => navigator.serviceWorker.ready)
    .catch((error) => { registration = null; throw error; });
}


self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "FindMiPaw",
      body: event.data?.text() || "Someone reported a sighting."
    };
  }

  const title = data.title || "FindMiPaw";
  const options = {
    body: data.body || "Someone reported a sighting of your missing dog.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: {
      url: data.url || "/"
    },
    tag: data.tag || "findmipaw-sighting"
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      return clients.openWindow(url);
    })
  );
});

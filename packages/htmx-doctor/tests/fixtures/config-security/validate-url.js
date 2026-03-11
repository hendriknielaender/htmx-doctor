document.body.addEventListener("htmx:validateUrl", (event) => {
  if (!event.detail.sameHost && event.detail.url.hostname !== "api.example.com") {
    event.preventDefault();
  }
});

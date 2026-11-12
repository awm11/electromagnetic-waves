# Electromagnetic waves

Interactive GCSE physics simulations, built with Vite and deployed to GitHub Pages.

- `/` — landing page linking to each simulation. Old links to the radio waves app (e.g. `/#encoding`) forward to it.
- `/radio-waves/` — producing and receiving radio waves. Modes (each has its own link via the URL hash):
  - `#field-map` (Mast to house) — a transmitting mast with an alternating current, and the field spreading out to a receiving aerial
  - `#inside-the-wave` — the electric and magnetic fields of the travelling wave, at right angles
  - `#over-the-hill` — long wave vs shorter wave diffracting over a hill
  - `#encoding` — AM and FM modulation, with a working decoder
  - `#sending-data` — send SOS at three carrier frequencies and two speeds to see why higher frequencies carry more data
- `/infrared/` — emitting and absorbing infrared. Scenarios: `#banana` (cupboard), `#pottery` (kiln), `#bagel` (freezer), with matt black, grey and shiny silver surfaces.

## Develop

```
npm install
npm run dev
```

Pushing to `main` builds the site and deploys it to GitHub Pages.

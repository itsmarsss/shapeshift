# ShapeShift

Try it at [tryshapeshift.com](https://tryshapeshift.com).

## 🚀 Join the ShapeShift Waitlist

### We’re getting ready to launch ShapeShift! Be among the first to try it out by joining the waitlist:

### 👉 [Sign up here](https://tryshapeshift.com/waitlist)

## How to run

1. Ensure you have Node and pnpm installed
2. Run the following commands:
    - `pnpm install` (from the repo root)
    - `pnpm exec wrangler login` (needed for the Workers AI binding in dev)
    - `cp backend/.dev.vars.example backend/.dev.vars` and set `ANTHROPIC_API_KEY` to use Claude. Without a key the assistant falls back to Workers AI
    - `pnpm dev`
    - No Cloudflare login? `pnpm dev:offline` runs everything locally except Workers AI
3. Open the browser and go to `http://localhost:5173`

## Hand control

Turn it on with the hand button in the top bar. Pinch an object with your right hand to drag it. In Edit mode, point your right hand at a vertex to highlight it and pinch to drag it. Pinch with your left hand, or pinch empty space, to orbit. Pinch with both hands to zoom and pan.

Hand tracking runs MediaPipe in a Web Worker, smooths landmarks with a One Euro filter, and detects pinches with a state machine that needs two frames to start or end a pinch. Add `?record` to the URL to record landmark streams or replay one. The gesture tests in `src/hands` replay recorded streams.

## Development

- `pnpm test` runs the unit tests (scene commands, undo, the assistant's agent loop and Worker, gestures)
- `pnpm e2e` runs the browser tests against a local production build (Worker, D1 and R2 included)
- `pnpm lint` and `pnpm build` must pass before merging

## Accounts and cloud saves

The editor runs entirely in the browser. Accounts (sign in with an email code), cloud saves, shared rooms and the waitlist run on the Worker:

- **D1** holds users, sessions, sign-in codes, the waitlist and the scene index. Run `pnpm db:migrate` once for local development
- **R2** stores saved scenes and their previews
- **Durable Objects** host shared rooms
- **Email** goes through Resend. Without `RESEND_API_KEY`, sign-in codes are printed and shown on localhost only

Before the first deploy: `wrangler secret put RESEND_API_KEY`.

## Plans and billing

Visitors get 10 assistant prompts a month, free accounts 50 and Pro 300 (`shared/src/billing/plans.ts`). Free accounts keep 10 cloud scenes, Pro 200. Everything that runs in the browser is free for everyone.

Pro is sold through Stripe Checkout, and people manage or cancel it in the Stripe customer portal. To turn it on:

1. In Stripe, make a Pro product with a monthly and a yearly price matching `PRO_PRICES`, and turn on the customer portal
2. Add a webhook endpoint for `https://<your domain>/api/billing/webhook` with `checkout.session.completed` and `customer.subscription.created`, `.updated` and `.deleted`
3. From `backend`, set the secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` (`pnpm exec wrangler secret put <name>`)

Without them the pricing page says Pro isn't available yet and everyone stays on the free plan. Locally, put test-mode values in `backend/.dev.vars` and forward webhooks with `stripe listen --forward-to localhost:5173/api/billing/webhook`.

## Project layout

- `frontend/` is the editor: React, three.js and hand tracking. It runs entirely in the browser
- `backend/` is the Cloudflare Worker: the assistant, shared rooms, accounts, cloud saves, share links and the waitlist, plus its D1 migrations and `wrangler.jsonc`
- `shared/` is the contract between them: the scene schema, the AI tool definitions and the agent and room protocols, imported as `@shapeshift/shared/...`

It's one pnpm workspace. Run `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm e2e` and `pnpm build` from the root.

## How to deploy

From `backend`, run `pnpm exec wrangler secret put ANTHROPIC_API_KEY` once, then `pnpm deploy` from the root. This builds the app and deploys the Worker to `tryshapeshift.com`. `AGENT_MODEL` and `AGENT_EFFORT` in `wrangler.jsonc` pick the Claude model and effort.

`www.tryshapeshift.com` is a separate tiny Worker that redirects to the bare domain. It rarely changes; deploy it from `backend` with `pnpm exec wrangler deploy -c redirect/wrangler.jsonc`.

## Inspiration

We've always been fascinated by the futuristic interfaces in movies like _Minority Report_ and _Iron Man_. Traditional 3D modeling software, while powerful, often has a steep learning curve and relies on clunky keyboard shortcuts and mouse clicks. We asked ourselves: what if we could sculpt 3D objects as naturally as if we were molding clay with our own hands? Our inspiration was to **bridge the gap between human intuition and digital creation**, building an accessible, immersive, and magical 3D modeling experience right in the browser. We wanted to create a tool that feels less like operating a machine and more like an extension of our own creativity.

---

## What it does

ShapeShift is an innovative, browser-based 3D modeling platform that transforms your webcam into a powerful creation tool. It allows users to interact with a 3D environment in two revolutionary ways:

-   **👋 Real-Time Gesture Control:** Using your hands, you can grab and move objects and orbit and zoom the camera, with no mouse or keyboard needed.
-   **🤖 AI Agent Assistant:** ShapeShift features an intelligent AI assistant that understands natural language. You can simply tell the AI what you want to create or modify. For example, you can say, "Create a red sphere and a blue cube, then place the sphere on top of the cube," and the AI will execute the commands.

---

## How we built it

ShapeShift is built on a modern, multi-faceted tech stack designed for real-time performance and intelligence.

-   **Frontend:** The entire user interface is a dynamic web application built with **React**, **TypeScript**, and **Vite**. For rendering the 3D environment, we used the powerful **Three.js** library, primarily through the declarative APIs of **@react-three/fiber** and **@react-three/drei**. The scene lives in one **Zustand** store and every change is a zod-validated command applied with Immer patches, so everything can be undone.

-   **Hand tracking:** Gesture control runs entirely in the browser. **MediaPipe** Hand Landmarker runs in a Web Worker on the webcam feed, so video never leaves the user's machine.

-   **Backend (AI Agent):** A **Cloudflare Worker** serves the app and exposes `/api/agent`. The browser runs the agent loop: it sends the conversation, the Worker streams back the model's next step from **Claude** (or **Workers AI** without a key), and the browser runs the tool calls against the scene and sends the results back until the model is done. Each reply is one undo step. Requests are validated and rate limited per IP.

---

## Challenges we ran into

Building a project this ambitious came with its fair share of hurdles.

One of the biggest challenges was **minimizing latency**. For the gesture control to feel natural, the delay between a physical hand movement and the response in the 3D viewport had to be negligible. We spent a significant amount of time optimizing our Python backend, implementing frame-skipping logic and efficient data serialization to ensure the WebSocket connection remained snappy.

Another difficulty was designing a **robust gesture recognition system**. Raw hand landmark data from MediaPipe is noisy and varies between users. We had to develop normalization and rotation-invariant processing techniques to translate this raw data into consistent, reliable commands like "pinch" or "grab."

Finally, **integrating the three distinct parts** of our application (Python CV, Node.js AI, and React frontend) was a complex architectural task. Ensuring smooth communication and state synchronization between these services required careful planning and debugging.

---

## Accomplishments that we're proud of

We are incredibly proud of creating a **truly multi-modal interface** for 3D creation. The ability to seamlessly switch between direct, physical manipulation with your hands and high-level, abstract commands with your voice is the core of what we wanted to achieve.

The **low-latency performance** of the hand-tracking pipeline is a major accomplishment. It feels fluid and responsive, which is crucial for making the experience immersive rather than frustrating.

Furthermore, we developed a **comprehensive and powerful toolset for our AI agent**. The AI can do more than just create primitives; it can perform complex boolean operations, modify materials, duplicate objects, and even generate entirely new models, giving users immense creative leverage through simple language.

---

## What we learned

This project was a massive learning experience. We learned a great deal about the intricacies of **real-time computer vision** and the importance of performance optimization at every step of the data pipeline. We also gained a deep appreciation for the complexities of **human-computer interaction design**, especially when creating novel interfaces that don't rely on established conventions.

On the AI front, we learned how to effectively design and implement a **tool-using AI agent**. Defining clear, non-overlapping functions and engineering the system prompts to get reliable, structured output from the LLM was a fascinating challenge that pushed our understanding of applied AI.

---

## What's next for ShapeShift

The future is bright and three-dimensional! We have many ideas for where to take ShapeShift next:

-   **Expanded Gesture Library:** We plan to introduce more complex and two-handed gestures for advanced actions like scaling the entire scene, drawing custom shapes, or performing intricate sculpting operations.
-   **Multi-User Collaboration:** We want to turn ShapeShift into a collaborative space where multiple users can join a session and build together in real-time, seeing each other's virtual hands.
-   **AR/VR Integration:** The ultimate goal is to break free from the 2D screen entirely. We plan to adapt our interaction model for augmented and virtual reality headsets to create a fully immersive 3D modeling environment.
-   **Smarter AI:** We will continue to enhance our AI's capabilities, enabling it to understand more complex, multi-step commands and maintain a better contextual awareness of the user's project goals.

# ShapeShift

## 🚀 Join the ShapeShift Waitlist

### We’re getting ready to launch ShapeShift! Be among the first to try it out by joining the waitlist:

### 👉 [Sign up here](https://forms.gle/iuHUNXTYS36t82Hh8)

## How to run

1. Ensure you have Node and pnpm installed
2. Run the following commands to set up the frontend:
    - `cd frontend`
    - `pnpm install`
    - `pnpm dev`
3. Open the browser and go to `http://localhost:5173`
4. Enjoy! (note: the AI agent is not currently configured to work properly, so a fallback mode is used instead)

A production version will be released soon.

## Inspiration

We've always been fascinated by the futuristic interfaces in movies like _Minority Report_ and _Iron Man_. Traditional 3D modeling software, while powerful, often has a steep learning curve and relies on clunky keyboard shortcuts and mouse clicks. We asked ourselves: what if we could sculpt 3D objects as naturally as if we were molding clay with our own hands? Our inspiration was to **bridge the gap between human intuition and digital creation**, building an accessible, immersive, and magical 3D modeling experience right in the browser. We wanted to create a tool that feels less like operating a machine and more like an extension of our own creativity.

---

## What it does

ShapeShift is an innovative, browser-based 3D modeling platform that transforms your webcam into a powerful creation tool. It allows users to interact with a 3D environment in two revolutionary ways:

-   **👋 Real-Time Gesture Control:** Using your hands, you can directly manipulate objects in the 3D scene. ShapeShift tracks your hand movements in real-time, allowing you to grab, move, rotate, and scale objects with intuitive gestures, eliminating the need for a mouse and keyboard.
-   **🤖 AI Agent Assistant:** ShapeShift features an intelligent AI assistant that understands natural language. You can simply tell the AI what you want to create or modify. For example, you can say, "Create a red sphere and a blue cube, then place the sphere on top of the cube," and the AI will execute the commands.

---

## How we built it

ShapeShift is built on a modern, multi-faceted tech stack designed for real-time performance and intelligence.

-   **Frontend:** The entire user interface is a dynamic web application built with **React**, **TypeScript**, and **Vite**. For rendering the 3D environment, we used the powerful **Three.js** library, primarily through the declarative APIs of **@react-three/fiber** and **@react-three/drei**. Global state management is handled efficiently by **Zustand**.

-   **Hand tracking:** Gesture control runs entirely in the browser. **MediaPipe** Hand Landmarker (WebAssembly + WebGL) reads the webcam feed and detects hand landmarks in real time, so video never leaves the user's machine.

-   **Backend (AI Agent):** The AI assistant is orchestrated by a **Node.js** server using **Express**. This server acts as a middleware that defines a set of tools (functions) the AI can use to manipulate the 3D scene. It integrates with LLM providers (like Martian).

The frontend sends user prompts to the Node.js server to trigger AI actions.

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

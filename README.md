# StudyPulse — Daily Study & Revision Graph Tracker

A web application to log daily study hours broken down into **Lecture Time** and **Revision Time**, automatically plot interactive study graphs over dates, and sync with **Google Sign-In (Firebase Auth & Firestore)**.

## Features
- **Separate Lecture & Revision Inputs**: Log hours studied for any date with separate sliders/inputs for **Lecture Time** and **Revision Time**, plus automatic total calculation.
- **Interactive Daily Study Graph**:
  - **Stacked Bar + Total Trend Line**: Visualizes Lecture and Revision stacks per day alongside your overall daily total curve.
  - **Separate Lines**: Compares Lecture Time, Revision Time, and Total Hours side-by-side.
  - **Cumulative Growth**: Tracks cumulative hours studied over time.
- **Lecture vs. Revision Balance**: Doughnut chart and retention insights based on your revision-to-lecture ratio.
- **Google Sign-In & Cloud Sync**:
  - **Option 1 (Instant)**: Sign in immediately with your Google Name & Email in the browser.
  - **Option 2 (Firebase Cloud OAuth)**: Paste your Firebase Web App config in the **Google Sign-In** modal to enable Google OAuth Popup (`GoogleAuthProvider`) and real-time Cloud Firestore sync (`users/{uid}/studyLogs/{date}`).

## Running Locally
```bash
npm start
# Opens at http://localhost:8080
```

## Publishing to the Web
- **Instant Public Tunnel**:
  ```bash
  ssh -R 80:localhost:8080 nokey@localhost.run
  ```
- **Permanent Static Hosting (Surge / Vercel / Netlify / Firebase)**:
  ```bash
  npx surge .
  # or
  npx vercel --prod
  ```

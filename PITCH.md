# PulseBoard: 5-minute pitch

**One-liner:** PulseBoard turns the classroom board into a live "I'm lost" meter. Students tap anonymously from their phones, and the teacher sees confusion the moment it happens, not at the exam.

**Roles (if you're two):** the **Speaker** talks and faces the judges. The **Driver** sits at the laptop and clicks. Solo: keep the laptop in reach and click on the cue words in **bold**.

---

## Before you go on stage (10 minutes before)

1. Run `npm run share` and wait for **"Public link ready"** in the terminal.
2. Open `http://localhost:4300/board` on the projector. Check that the URL under the QR code is the `trycloudflare.com` link, not a `10.x.x.x` address. Press **⛶** for full screen.
3. Scan the QR code with your own phone, tap a button and send a test question. Check that both show up on the board.
4. Press **↺ New class** to clear the test. Your phone stays connected, so the board will show 1 student.
5. Keep mobile data on your phone in case the venue Wi-Fi blocks the link.
6. Turn off laptop notifications and stop the laptop from sleeping.
7. Backup: have a 30-second screen recording of Demo mode open in another window.

---

## The script

### 0:00–0:30 · Hook

> Quick show of hands: who has sat in a lecture, completely lost, and said nothing?
>
> *(wait for hands)*
>
> Almost everyone. And the teacher had no idea, because the students who are lost are exactly the ones who don't raise their hand.

### 0:30–1:00 · Problem

> In a class of 60, a teacher might get two or three questions. Everyone else stays quiet. They're shy, or they don't want to look slow in front of the class.
>
> So the teacher finds out who was lost when the exam results come in. By then it's too late.

### 1:00–1:20 · Solution

> We built **PulseBoard**. It turns the classroom screen into a live pulse of the room. Students scan a QR code and tap one of three buttons: Got it, Slow down, or I'm lost. No app, no login, completely anonymous.
>
> Let's not talk about it. Let's try it.

### 1:20–3:20 · Live demo (2 minutes)

**Step 1: Judges join (about 25 s)**
- DO: click the QR code to make it full screen.

> Please scan this with your phone camera.

- DO: when the judges' phones show the three buttons, click again to close the big QR.
- SCREEN: the "students connected" number goes up.

**Step 2: Judges tap (about 15 s)**

> Now, honestly: how are you following this pitch? One of you, tap **Got it**. The other two, please be brave and tap **I'm lost**.

- SCREEN: the lost meter jumps. With 2 of 4 phones lost (3 judges plus yours), it's 50%, so the red **"Time for a quick recap?"** alert appears. It fires at 30% or more.

> That's the teacher's signal. The board says it out loud, so no student has to.

**Step 3: An anonymous question (about 15 s)**

> Now type any question into the box. Something you'd be too shy to ask out loud.

- SCREEN: the question slides onto the question wall.

> No name, no face. The teacher just sees the question.

**Step 4: A real class (about 40 s)**

> That's four people. A real lecture has forty. Let me show you what a real class looks like.

- DO: click **▶ Demo**. This adds 36 simulated students on top of the judges.
- SAY while the meter climbs:

> The class is following at first. Mostly green. Now the teacher moves on to a harder topic, and watch: the "slow down" taps start, then the "I'm lost" taps. The meter turns amber, then red…

- SCREEN: about 15–20 seconds in, the red alert fires.

> …and there's the alert. *(read the number)* percent of the room is lost, right now, in the middle of the lecture. The teacher can stop and recap *before* moving on.

**Step 5: AI summary (about 15 s)**
- DO: wait until the question wall shows 8 or more questions (about 35–40 seconds into Demo), then click **✨ AI summary**. If it's not there yet, keep talking about the alert for a few more seconds.

> Thirty questions on a wall is too much to read while you're teaching. So one tap groups them with AI.

- SCREEN: themes appear, for example "TCP vs UDP — 6 students", plus a tip for the teacher.

> Now the teacher knows *what* the class is stuck on, not just that they're stuck.

**Step 6: Timeline (about 10 s)**
- DO: point at the class timeline.

> And after class, the timeline shows exactly *when* the room got lost. Peak confusion at this minute, which means this slide needs to be taught again.

- DO: click **■ Stop demo**. The simulated students and their questions disappear; the judges' real questions stay.

### 3:20–4:00 · Why it works

> Three things make this work.
>
> One, **it's anonymous**. Honest answers only come when nobody's watching.
>
> Two, **it's always on**. Polling tools need the teacher to stop and run a poll. PulseBoard runs quietly for the whole lecture.
>
> Three, **it runs on the screen that's already in the classroom**. It's just a web page, so it works on any screen with a browser, like a BenQ interactive board or a laptop on a projector, with nothing to install.

### 4:00–4:40 · Tech and what's next

> We built it in under an hour: Node.js and Socket.io for live updates, no database, no login. The AI summary uses a free model on Groq, and if the internet goes down it falls back to keyword grouping, so the class never breaks.
>
> Next steps: a campus-wide dashboard that shows which courses and topics lose students most. A link to the college's learning platform. And support for more languages, so every student can say "I'm lost" in their own language.

### 4:40–5:00 · Close

> Every lost student is a question that was never asked. PulseBoard makes sure the teacher hears it, while there's still time to help.
>
> Thank you. We're happy to take questions.

---

## If something breaks

| Problem | What to do |
|---|---|
| Judges' phones can't open the link | Say "Venue Wi-Fi, of course," then skip Steps 1–3 and go straight to **▶ Demo**. Demo mode works fully offline. |
| The AI summary is slow or fails | It falls back to keyword grouping on its own. Say "That's our offline fallback." |
| The laptop or projector fails | Play the 30-second screen recording and narrate over it. |
| Only one judge joins | Ask them to tap **I'm lost**. One out of two phones (yours plus theirs) is 50%, so the alert still fires. |

---

## Likely judge questions

**"Isn't this just Mentimeter or Slido?"**
Those are built for polls, quizzes and Q&A that the teacher sets up and starts. PulseBoard runs all lecture long with no setup, shows a live confusion level with an alert, groups questions with AI, and shows *when* the class got lost on a timeline.

**"Won't students spam it or post rude questions?"**
Each phone can send one question every 5 seconds, up to 200 characters, and every tap expires after 2 minutes. Moderation, such as a profanity filter or the teacher hiding a question, is on our roadmap.

**"What about privacy?"**
There's no login and no names. Each phone gets a random ID, and nothing is saved to disk. A restart starts a fresh class. When the teacher clicks AI summary, only the anonymous question text is sent to the AI provider.

**"Does it scale?"**
Today it handles one classroom per server, which is what a prototype needs. For a whole campus we'd add a room code per class and a small database. The live-update design stays the same.

**"What does it cost?"**
The software is free to run. It works in any browser, and the AI uses a free tier. The only hardware is the screen the classroom already has.

**"Why BenQ?"**
Most classroom tools live on a laptop or a phone. PulseBoard makes the classroom board the centre of the lesson: the screen doesn't just show slides, it shows how well the room understands them.

# My Private Space

Lovable Prompt – "youandme" Messaging Website

Build a modern, premium, 100% mobile-first responsive messaging web application named "youandme" (without spaces). The entire experience should be designed primarily for smartphones while also working perfectly on tablets and desktops.

Landing Page

Create a beautiful full-screen landing page.

Use a rich, aesthetic animated background with soft gradients, floating glowing particles, blurred glass effects, and smooth transitions.

Place a single elegant button in the exact center labeled youandme.

No other buttons or menus should appear on the landing page.

Add a subtle fade-in animation for the button.

When the user taps the button, smoothly transition to the chat interface.

Chat Interface

Design the chat screen similar to WhatsApp but with its own modern identity.

Requirements:

Full-screen chat interface.

Mobile-first layout.

Fixed header showing:

youandme

Online status

Scrollable message area.

Fixed message input at the bottom.

Rounded message bubbles.

Sent messages aligned to the right.

Received messages aligned to the left.

Different bubble colors for sent and received messages.

Smooth animations when messages are sent or received.

Auto-scroll to the newest message.

Show timestamps on every message.

Show delivery/read indicators.

Messaging Features

Implement a real-time private messaging experience.

Support:

Text messages

Emoji picker

Image sharing

Upload up to 10 images per message

Large high-quality images

Image preview before sending

Tap image to open full-screen viewer

Pinch-to-zoom support on mobile

Image download option

Drag-and-drop upload (desktop)

Gallery upload (mobile)

Message Storage

Messages must never disappear.

Requirements:

Store every message permanently in a backend database.

Store uploaded images permanently in cloud storage.

Messages must remain available after:

Page refresh

Browser close

Device restart

Logging in from another device

No automatic deletion.

No message expiration.

Use a reliable backend such as Supabase or Firebase for authentication, real-time database, and storage.

Authentication

Only two authorized users can use the application.

Features:

Secure login.

Two predefined user accounts.

No public registration.

Unauthorized users cannot access the chat.

Chat Experience

Make the experience premium.

Include:

Typing indicator

Online/offline status

Read receipts

Delivered status

Message animations

Smooth transitions

Swipe gestures where appropriate

Long press for message options

Copy message

Delete only for yourself (optional)

Search messages

Scroll to latest message button

Mobile Optimization

This is the highest priority.

Requirements:

Designed primarily for phones.

Perfect on Android and iPhone.

Safe-area support for notched devices.

Responsive keyboard handling.

Touch-friendly controls.

Fast loading.

Smooth scrolling.

No horizontal scrolling.

Responsive image rendering.

Large tap targets.

Design Style

Create a premium romantic aesthetic.

Use:

Glassmorphism

Soft shadows

Rounded corners

Gradient backgrounds

Animated floating lights

Elegant spacing

Minimal UI

Modern icons

Clean typography similar to WhatsApp's default font (system sans-serif)

Rich color palette with deep purple, blue, pink, and teal gradients.

Performance

Optimize for:

Fast loading

Lazy loading images

Image compression

Smooth animations

Efficient caching

Excellent mobile performance

Technology

Use:

React

TypeScript

Tailwind CSS

Supabase (Authentication, Realtime Database, Storage)

Responsive design best practices

Progressive Web App (PWA) support so it behaves like a mobile app.

Final Goal

Create a polished, beautiful, creative, and premium messaging website called youandme that feels like a private WhatsApp-style chat exclusively for two people. The application must be secure, real-time, permanently store all messages and images, support sending up to 10 photos at once, and provide an outstanding mobile experience with elegant animations, modern UI, and smooth interactions.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://youandme-sbs.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9d6f9f0f-bf59-474f-a7dd-1b497179150a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

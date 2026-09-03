# BISLIG RIDE — PROJECT CONTEXT

## 1. PROJECT OVERVIEW

Bislig Ride is a local ride-hailing and local discovery web application for Bislig City, Philippines.

The long-term vision is:

DISCOVER BISLIG → DECIDE WHERE TO GO → BOOK A RIDE

The app should eventually allow locals and visitors to discover:
- Restaurants
- Hotels & Resorts
- Tourist Destinations
- Upcoming Events
- Local Businesses

Then users can book a ride to those places.

The project should feel like a real, professional local mobility platform — not a generic demo.

---

## 2. PROJECT LOCATION

Local project:

C:\Users\Maiev\Desktop\bislig-ride

GitHub repository:

https://github.com/KenGamonez/bislig-ride.git

Main branch:

main

Development server:

npm.cmd run dev

Local URL:

http://localhost:5173/

Deployment:

Vercel

---

## 3. CURRENT TECHNOLOGY

The project currently uses:

- React
- TypeScript
- Vite
- Supabase
- OpenStreetMap / CARTO map
- Open-Meteo weather API
- Vercel
- Git / GitHub

Do not introduce a completely different framework unless explicitly requested.

---

## 4. IMPORTANT DEVELOPMENT RULES

Before changing anything:

1. Inspect the existing project.
2. Understand the current implementation.
3. Make the smallest necessary change.
4. Preserve existing functionality.
5. Do not rewrite working components unnecessarily.
6. Do not create fake production data.
7. Do not weaken Supabase RLS policies.
8. Do not expose service-role keys or secrets.
9. Run the production build after significant changes.
10. Check for TypeScript/build errors before declaring the task complete.
11. Do not redesign unrelated parts of the application.
12. Do not remove existing features unless explicitly instructed.

Prefer surgical edits over large rewrites.

---

# 5. CUSTOMER EXPERIENCE

The customer homepage is the main public experience.

Current booking fields include:

- Pickup
- Use My Current Location
- Destination
- Full Name
- Phone Number
- Number of Passengers
- Passenger Type
- Request Ride

Fare calculation foundation already exists.

The map is already centered within Bislig City.

Do NOT unnecessarily modify the map implementation.

---

# 6. WEATHER WIDGET

A live Bislig weather widget already exists.

It uses Open-Meteo.

Features include:

- Current temperature
- Weather condition
- Feels-like temperature
- Humidity
- Precipitation
- Weather icon
- Timestamp
- Loading state
- Error state
- Automatic refresh every 15 minutes

Weather failures should never break the ride booking experience.

---

# 7. EXPLORE BISLIG

The customer navigation currently includes an:

Explore Bislig

dropdown.

Categories:

- Restaurants
- Hotels & Resorts
- Tourist Destinations
- Upcoming Events
- Local Businesses

The dropdown supports:

- Desktop hover
- Click/tap toggle
- Outside-click closing
- Escape key
- Keyboard accessibility
- Mobile support

These categories are currently placeholders because the actual discovery content/pages have not yet been built.

Long-term goal:

Businesses and events can eventually have profiles containing things such as:

Businesses:
- Name
- Category
- Photos
- Location
- Contact information
- Opening hours
- Menu/services
- Featured placement
- Ride There button

Events:
- Event poster
- Title
- Date
- Venue
- Description
- Organizer
- Ride There button
- Featured/sponsored placement

Potential future monetization:

- Featured Businesses
- Local Partners
- Sponsored Events

Paid placements should be clearly labeled as Sponsored.

---

# 8. CURRENT EXPLORE BISLIG ISSUE

There was recently an attempt to remove a duplicate "Explore Bislig" heading inside the dropdown.

The intended result:

The navigation trigger already says:

Explore Bislig

Therefore the dropdown should NOT repeat another heading saying:

Explore Bislig

The dropdown should begin directly with the category list.

IMPORTANT:

A previous AI edit accidentally damaged parts of CustomerExperience.tsx while trying to remove the heading.

Those issues were reportedly repaired and the production build eventually passed.

If working on this file, inspect the current code first.

Do NOT blindly recreate the previous changes.

---

# 9. PAKYAWAN / SCHEDULED BOOKING

There is a Pakyawan scheduled booking feature.

Route:

/pakyawan

The customer navigation contains:

Book Pakyawan

instead of the old Help link.

The form includes:

- Trip date
- Pickup time
- Pickup
- Destination
- Passengers
- Trip type
- Special requests
- Name
- Phone

The initial booking status is:

pending

Users can submit without authentication.

Authenticated admins can read the scheduled bookings.

Anonymous users must NOT receive read/update access.

There is currently:

- No automatic fare calculation
- No admin scheduling dashboard
- No fake driver assignment
- No fake vehicle assignment
- No fake quotes
- No fake booking lifecycle

Do not add fake operational data.

---

# 10. BECOME A DRIVER

There is a public:

/become-a-driver

page.

Drivers can submit an application.

Applications are stored in Supabase.

Public users cannot read applications.

Admin users can review applications and update application status.

Driver enrollment is considered complete for now.

There is currently only a real-world driver prospect being waited on.

DO NOT create fake drivers, fake driver photos, or fake driver profiles.

Real driver information will be added later.

---

# 11. ADMIN AUTHENTICATION

Admin authentication uses:

Supabase Auth

The admin account has:

app_metadata.role = admin

The admin email currently configured is:

kennygmonez@gmail.com

The admin role has already been configured in Supabase.

Do not ask the project owner to repeat this setup unless there is an actual authentication problem.

Admin authentication behavior:

- Sign in with Supabase Auth
- Check app_metadata.role
- Reject authenticated users who are not admins
- Restore persisted Supabase sessions
- Listen for Supabase auth state changes
- Logout using supabase.auth.signOut()

Never expose the Supabase service-role key in frontend code.

---

# 12. ROLE SWITCHER

The customer homepage intentionally shows:

Customer | Driver | Admin

This is intentional.

DO NOT hide or remove these options.

The goal is that users can enter the appropriate experience/login.

---

# 13. SUPABASE SECURITY

Supabase RLS is important.

Existing security should be preserved.

Do NOT:

- Disable RLS
- Add anonymous SELECT access to private driver applications
- Add anonymous UPDATE access to private data
- Expose service-role credentials
- Bypass authentication

When changing database policies, inspect existing policies first.

---

# 14. VERCEL ROUTING

A root-level:

vercel.json

exists to support SPA routing.

It fixes direct navigation to routes such as:

/become-a-driver

Do not remove or modify this routing configuration unless there is a specific routing problem.

---

# 15. GIT WORKFLOW

GitHub repository:

https://github.com/KenGamonez/bislig-ride.git

Branch:

main

Before committing:

git status

After making changes:

git add -A

git commit -m "Clear description of change"

git push origin main

Do not use destructive Git commands such as:

git reset --hard

git restore

or force push

unless explicitly instructed.

---

# 16. BUILD VALIDATION

Production build command:

npm.cmd run build

A successful build is required after significant code changes.

Existing Vite warning:

vite.config.ts currently uses __dirname with configLoader: 'native'.

This is a warning and should NOT be changed just for cosmetic reasons.

The recommended future change is import.meta.dirname, but do not make unrelated changes unless requested.

---

# 17. DESIGN DIRECTION

The application should feel:

- Premium
- Modern
- Clean
- Professional
- Local
- Trustworthy
- Easy to use

Avoid unnecessary:

- Gradients
- Glassmorphism
- Excessive animations
- Clutter
- Huge vertical spacing
- Generic template styling

The customer experience should prioritize:

1. Booking a ride
2. Discovering Bislig
3. Seeing useful local information

---

# 18. PRODUCT DIRECTION

Bislig Ride is not intended to be only a ride-booking website.

The larger concept is:

LOCAL DISCOVERY + MOBILITY

A user might visit because they want to:

- Find a restaurant
- Find a hotel
- Discover a tourist destination
- See upcoming events
- Find a local business

Then the app can naturally offer:

Ride There

This creates a connection between local discovery and transportation.

---

# 19. FUTURE FEATURES

Possible future features, in roughly useful order:

- Real driver profiles
- Driver availability
- Ride status
- Ride history
- Fare estimate
- Rating and feedback
- Saved places
- Safety features
- Notifications
- Help/reporting
- Local business profiles
- Event listings
- Featured businesses
- Sponsored events
- "Ride There" functionality
- Admin content management
- Payments/wallet later

Do not implement these automatically.

Only implement a requested feature.

---

# 20. CURRENT PRIORITY

The immediate development workflow is:

1. Keep existing functionality stable.
2. Wait for real driver information before creating real driver profiles.
3. Continue building useful features that do not depend on real driver data.
4. Build the Explore Bislig discovery system carefully.
5. Eventually create admin management for local businesses/events.
6. Keep the application commercially presentable.

---

# 21. HOW THE AI CODING AGENT SHOULD WORK

The project owner is new to command-line development.

Explain important actions simply.

Before making a change:

- Inspect the relevant files.
- Explain briefly what you found.
- Make the change.
- Run the build.
- Report exactly what changed.
- Report whether the build passed.

Do not overwhelm the project owner with unnecessary technical explanations.

If something is uncertain, inspect the project rather than guessing.

---

# 22. IMPORTANT

This file is the project handoff document.

When starting work, read this file first.

Then inspect the actual source code.

The source code is the source of truth if this document conflicts with the current implementation.

Never assume a feature exists merely because this document says it should exist.

Always verify the actual code before modifying it.
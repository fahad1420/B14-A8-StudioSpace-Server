# StudioSpace — Backend API Server
### Official Assignment: B14-A8 | StudioSpace
**Tagline:** Find Your Space. Create Your Story.  
**Repository:** `b14-a8-shoot-location-server`

---

## 1. Overview
The **StudioSpace API Server** is a high-performance RESTful backend engineered specifically for peer-to-peer creative studio and production space rentals. Built with **Node.js, Express.js, TypeScript, and MongoDB Atlas**, it provides secure session management, JWT authorization via HTTPOnly cookies, real-time conflict-free booking orchestration, and role-enforced studio CRUD operations.

---

## 2. Technology Stack
- **Runtime:** Node.js (v24+)
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** MongoDB Atlas (native official `mongodb` driver)
- **Authentication:** Better Auth + JWT HTTPOnly cookies
- **Validation:** Zod schemas
- **Security:** Credentialed CORS, HTTPOnly & Secure Cookie protection, pbkdf2 password hashing

---

## 3. Database Architecture & Collections

### Collections:
1. `user`: Better Auth user profile entities (id, name, email, emailVerified, image, timestamps).
2. `account`: Better Auth auth credentials provider table (userId, providerId, password hash, timestamps).
3. `session`: Better Auth active user sessions (token, userId, expiresAt).
4. `studios`: Creative workspace rental listings (title, category, hourlyRate, securityDeposit, maxCapacity, location, imageUrl, gallery, amenities, overview, hostId, hostName, hostEmail, rating, reviewCount, status).
5. `bookings`: Reservation records with strict time-slice constraints (studioId, studioTitle, studioImage, creatorId, creatorName, creatorEmail, hostId, hostName, hostEmail, bookingDate, startTime, endTime, duration, hourlyRate, rentalAmount, securityDeposit, totalAmount, status: `Pending` | `Confirmed` | `Completed` | `Cancelled`).
6. `reservation_locks`: Distributed concurrency lock records for safe atomic booking confirmation across multiple instances (`_id`: `studioId_bookingDate_startTime_endTime`, `expiresAt`, `createdAt`).
7. `wishlists`: Creator saved favorite studio records (`userId`, `studioId`, `createdAt`).
8. `newsletters`: Curated production drop newsletter subscribers (`email`, `subscribedAt`).

### Database Indexes:
- `studios`: `{ hostId: 1 }`, `{ category: 1 }`, `{ hourlyRate: 1 }`, text search `{ title: "text", location: "text" }`
- `bookings`: `{ creatorId: 1 }`, `{ hostId: 1 }`, `{ studioId: 1, bookingDate: 1, status: 1 }`
- `reservation_locks`: TTL index on `expiresAt`
- `wishlists`: compound unique index `{ userId: 1, studioId: 1 }`
- `newsletters`: unique index `{ email: 1 }`

---

## 4. API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new creator/host account with inline validation | No |
| `POST` | `/api/auth/login` | Authenticate user, issue HTTPOnly JWT cookie | No |
| `POST` | `/api/auth/logout` | Invalidate session & clear HTTPOnly cookies | Yes |
| `GET` | `/api/auth/me` | Retrieve authenticated profile from JWT session | Yes |
| `POST` | `/api/auth/sync-social` | Synchronize social login (Google) into JWT session | No |
| `ALL` | `/api/auth/*` | Better Auth native handler endpoints | Config |

### Studios (`/api/studios`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/studios` | Filter & search studios (category, price, search, sort, limit) | No |
| `GET` | `/api/studios/:id` | Fetch detailed studio profile | No |
| `POST` | `/api/studios` | Create a new studio listing (host identity derived from token) | **Yes (JWT)** |
| `PUT / PATCH` | `/api/studios/:id` | Update studio listing (owner verified, non-owners get 403) | **Yes (JWT)** |
| `DELETE` | `/api/studios/:id` | Delete studio listing (owner verified, non-owners get 403) | **Yes (JWT)** |

### Bookings (`/api/bookings`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/bookings` | Create reservation (Pending status, double-booking prevention) | **Yes (JWT)** |
| `GET` | `/api/bookings/my` | Retrieve bookings created by logged-in user | **Yes (JWT)** |
| `GET` | `/api/bookings/host` | Retrieve incoming booking requests for host's spaces | **Yes (JWT)** |
| `PATCH` | `/api/bookings/:id/cancel` | Cancel booking (creator or host permitted) | **Yes (JWT)** |
| `PATCH` | `/api/bookings/:id/status` | Update booking status (`Confirmed`, `Completed`, `Cancelled`) with concurrency lock | **Yes (Host only)** |

### Miscellaneous (`/api`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Healthcheck and server identity status | No |
| `POST` | `/api/newsletter` | Subscribe to curated creative drops | No |
| `GET` | `/api/wishlist` | Get user saved studios | **Yes (JWT)** |
| `POST` | `/api/wishlist/toggle` | Toggle studio in user saved list | **Yes (JWT)** |

---

## 5. Security & Mandatory Challenges Implementation

### A. JWT Security with HTTPOnly Cookies
- All state-mutating studio and booking routes (`POST /api/studios`, `DELETE /api/studios/:id`, `POST /api/bookings`, `PATCH /api/bookings/:id/*`) are strictly guarded by `requireAuth` middleware.
- Missing or invalid sessions reject with **HTTP 401 Unauthorized**.
- Tokens are stored exclusively in HTTPOnly cookies (`studiospace_jwt_token`), preventing Cross-Site Scripting (XSS) token exfiltration.
- Host and creator identities are strictly extracted from verified tokens; client-submitted `hostId`, `ownerEmail`, or monetary amounts are never trusted.

### B. Double Booking Prevention Algorithm
When a booking request or confirmation occurs:
1. The server queries all reservations for the targeted `studioId` on `bookingDate` with status `Confirmed`.
2. Overlap is determined via the strict interval condition:
   $$\text{start}_{\text{new}} < \text{end}_{\text{existing}} \quad \land \quad \text{end}_{\text{new}} > \text{start}_{\text{existing}}$$
3. If an overlap is detected, the request is rejected with **HTTP 409 Conflict** and a descriptive message.
4. During status transition to `Confirmed`, a distributed atomic lock (`reservation_locks`) guards against concurrent race conditions across multiple server instances.

---

## 6. Environment Variables

Create a `.env` file in the root of `b14-a8-shoot-location-server`:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/studiospace?retryWrites=true&w=majority
MONGODB_DB_NAME=studiospace
BETTER_AUTH_SECRET=studiospace-secure-jwt-auth-secret-key-32chars-min
BETTER_AUTH_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
JWT_SECRET=studiospace-secure-jwt-auth-secret-key-32chars-min

# Google OAuth Credentials (Optional in local development, required for cloud Google login)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

---

## 7. Google Cloud Console Setup (Google OAuth)

To configure Google Social Login with Better Auth:
1. Go to [Google Cloud Console](https://console.cloud.google.com/) -> **APIs & Services** -> **Credentials**.
2. Click **Create Credentials** -> **OAuth Client ID**.
3. Application Type: **Web application**.
4. Name: `StudioSpace Auth`.
5. **Authorized JavaScript origins:**
   - Local: `http://localhost:5000`, `http://localhost:3000`
   - Production: `https://<your-render-app>.onrender.com`, `https://<your-vercel-app>.vercel.app`
6. **Authorized redirect URIs:**
   - Local: `http://localhost:5000/api/auth/callback/google`
   - Production: `https://<your-render-app>.onrender.com/api/auth/callback/google`
7. Copy the generated **Client ID** and **Client Secret** into your `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## 8. Local Setup & Execution

```bash
# 1. Navigate to server folder
cd b14-a8-shoot-location-server

# 2. Install dependencies
npm install

# 3. Seed initial creative studios & examiner test account
npm run seed

# 4. Verify live MongoDB Atlas connection & collections
npm run verify:db

# 5. Run full automated audit test suite
npm run test:audit

# 6. Run live Atlas Studio CRUD & Booking verification
npm run test:crud-booking

# 7. Start development server with live reload
npm run dev

# 8. Build for production
npm run build

# 9. Start production build
npm start
```

---

## 9. Render Deployment Guide

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your GitHub repository `b14-a8-shoot-location-server`.
3. Configure settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
4. Set Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `5000`
   - `MONGODB_URI`: `<your-mongodb-atlas-connection-string>`
   - `MONGODB_DB_NAME`: `studiospace`
   - `BETTER_AUTH_SECRET`: `<secure-32-char-random-string>`
   - `JWT_SECRET`: `<secure-32-char-random-string>`
   - `BETTER_AUTH_URL`: `https://<your-render-app>.onrender.com`
   - `FRONTEND_URL`: `https://<your-vercel-app>.vercel.app`
   - `GOOGLE_CLIENT_ID`: `<your-google-client-id>` (optional)
   - `GOOGLE_CLIENT_SECRET`: `<your-google-client-secret>` (optional)

---

## 10. Examiner Test Account
For evaluator convenience, the database seed script generates verified host accounts:
- **Primary Email:** `examiner@studiospace.com`
- **Legacy Alias:** `examiner@shootlocation.com`
- **Password:** `ExaminerPassword123!`
- **Role:** Creative Studio Host & Creator (owns active seeded studios)

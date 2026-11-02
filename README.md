# Shoot Location — Backend API Server
### Official Assignment: B14-A8 | Shoot Location
**Tagline:** Find Your Space. Create Your Story.  
**Repository:** `b14-a8-shoot-location-server`

---

## 1. Overview
The **Shoot Location API Server** is a high-performance RESTful backend engineered specifically for peer-to-peer creative studio and production space rentals. Built with **Node.js, Express.js, TypeScript, and MongoDB Atlas**, it provides secure session management, JWT authorization via HTTPOnly cookies, real-time conflict-free booking orchestration, and role-enforced studio CRUD operations.

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
6. `wishlists`: Creator saved favorite studio records (`userId`, `studioId`, `createdAt`).
7. `newsletters`: Curated production drop newsletter subscribers (`email`, `subscribedAt`).

### Database Indexes:
- `studios`: `{ hostId: 1 }`, `{ category: 1 }`, `{ hourlyRate: 1 }`, text search `{ title: "text", location: "text" }`
- `bookings`: `{ creatorId: 1 }`, `{ hostId: 1 }`, `{ studioId: 1, bookingDate: 1, status: 1 }`
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
| `PATCH` | `/api/bookings/:id/status` | Update booking status (`Confirmed`, `Completed`, `Cancelled`) | **Yes (Host only)** |

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
- Tokens are stored exclusively in HTTPOnly cookies (`shoot_jwt_token`), preventing Cross-Site Scripting (XSS) token exfiltration.
- Host and creator identities are strictly extracted from verified tokens; client-submitted `hostId`, `ownerEmail`, or monetary amounts are never trusted.

### B. Double Booking Prevention Algorithm
When a booking request or confirmation occurs:
1. The server queries all reservations for the targeted `studioId` on `bookingDate` with status `Confirmed`.
2. Overlap is determined via the strict interval condition:
   $$\text{start}_{\text{new}} < \text{end}_{\text{existing}} \quad \land \quad \text{end}_{\text{new}} > \text{start}_{\text{existing}}$$
3. If an overlap is detected, the request is rejected with **HTTP 409 Conflict** and a descriptive message.

---

## 6. Environment Variables

Create a `.env` file in the root of `b14-a8-shoot-location-server`:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/shoot_location?retryWrites=true&w=majority
MONGODB_DB_NAME=shoot_location
BETTER_AUTH_SECRET=shoot-location-secure-jwt-auth-secret-key-32chars-min
BETTER_AUTH_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
JWT_SECRET=shoot-location-secure-jwt-auth-secret-key-32chars-min
```

---

## 7. Local Setup & Execution

```bash
# 1. Navigate to server folder
cd b14-a8-shoot-location-server

# 2. Install dependencies
npm install

# 3. Seed initial creative studios & examiner test account
npm run seed

# 4. Start development server with live reload
npm run dev

# 5. Build for production
npm run build

# 6. Start production build
npm start
```

---

## 8. Examiner Test Account
For evaluator convenience, the database seed script generates a verified host account:
- **Email:** `examiner@shootlocation.com`
- **Password:** `ExaminerPassword123!`
- **Role:** Creative Studio Host & Creator (owns active seeded studios)

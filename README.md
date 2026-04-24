# CredZen — Multi-Tenant Task Management Platform

CredZen is a secure, full-stack multi-tenant task management application built with Node.js, Express, PostgreSQL, and React. It features robust tenant isolation, Role-Based Access Control (RBAC), and comprehensive audit logging.

## 🚀 Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)

### 🐳 Running with Docker (Recommended)
The simplest way to get the entire stack running is via Docker Compose:

```bash
# Clone the repository and copy environment variables
cp .env.example .env

# Start the services
docker-compose up --build
```
The application will be available at:
- **Frontend**: http://localhost:3000
- **API Server**: http://localhost:5000/api
- **API Health**: http://localhost:5000/api/health

### 💻 Running Locally without Docker
Ensure you have PostgreSQL and Redis running locally and update your `.env` file accordingly.

**Server:**
```bash
cd server
npm install
npm run dev
```

**Client:**
```bash
cd client
npm install
npm run dev
```

## 📑 Seeding the Database
To populate the database with initial organizations, users, and tasks, run the seed script from the API container:

```bash
docker exec -it credzen_api node seed.js
```

## 🔒 API Endpoints & RBAC

All endpoints except authentication and health checks require a valid JWT in the `Authorization: Bearer <token>` header.

| Method | Path | Required Role | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/health` | Public | Health status check |
| **POST** | `/api/auth/register` | Public | Register new org + admin user |
| **POST** | `/api/auth/login` | Public | Login with credentials |
| **GET** | `/api/tasks` | All Roles | Fetch tasks (filtered by role/tenant) |
| **POST** | `/api/tasks` | Admin, Member | Create a new task |
| **PUT** | `/api/tasks/:id` | Admin, Member* | Update a task (*Owner only if Member) |
| **DELETE** | `/api/tasks/:id` | Admin, Member* | Delete a task (*Owner only if Member) |
| **GET** | `/api/orgs/members` | Admin | List all members in the organization |
| **POST** | `/api/orgs/invite` | Admin | Invite a new user to the organization |
| **PATCH** | `/api/orgs/members/:id/role` | Admin | Update a member's role |
| **GET** | `/api/audit` | Admin | View organization audit trail |


## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18+ with Vite
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Form Handling**: React Hook Form
- **Routing**: React Router DOM v6
- **Real-time Updates**: Socket.io-client
- **Styling**: Vanilla CSS / CSS Modules
- **Date Utilities**: date-fns, React Datepicker

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Caching/PubSub**: Redis (via ioredis)
- **Authentication**: Passport.js (Local, JWT, Google OAuth 2.0)
- **Security**: Helmet, Express Rate Limit, bcryptjs
- **File Uploads**: Multer
- **Real-time**: Socket.io

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Database Migration/Seeding**: Custom SQL/Node scripts

## 🛡️ Key Security Features
- **Tenant Isolation**: Every database query is scoped by `org_id` using middle-ware, ensuring data never leaks between organizations.
- **RBAC (Role-Based Access Control)**: Fine-grained permissions (Admin, Member, Viewer) enforced at the router level.
- **Auditing**: Comprehensive security audit trail logging all mutations (POST, PUT, DELETE) to an immutable table.
- **Password Hashing**: Industry-standard `bcryptjs` with 12 salt rounds.
- **Rate Limiting**: Protection against brute-force and DDoS attacks via middleware.
- **Secure Headers**: Implemented via `helmet` to mitigate common web vulnerabilities.
- **JWT Authentication**: Stateless session management with secure token signing.

## 🌟 Advanced Features
- **Real-time Notifications**: Instant dashboard updates via WebSockets when tasks are assigned or updated.
- **Multi-Tenant Super Admin**: Global visibility for platform administrators across all organizations.
- **Dynamic Task Assignment**: Assign tasks to specific members with deadlines and file attachments.
- **Organization Management**: Admins can invite members, manage roles, and monitor organization-specific logs.
- **Responsive Dashboard**: Modern, clean UI built for high productivity and ease of use.

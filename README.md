# Patel AutoPrint v2.0

Cloud-Based Multi-Tenant Print Shop Management & Automatic Printing Platform (SaaS)

## Tech Stack

### Backend
- Node.js + Express.js
- PostgreSQL + Prisma ORM
- JWT Authentication
- WebSocket (Real-time updates)
- PDF-Lib (PDF processing)
- Sharp (Image processing)

### Frontend
- React 18
- Material UI
- React Router
- React Query (TanStack Query)
- React Hook Form
- PDF.js (Preview)
- Tailwind CSS

### Print Agent
- Node.js (Windows)
- PowerShell (Printer discovery)
- Auto-update support

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (for job queues)

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd patel-autoprint
```

2. Install dependencies
```bash
npm install
```

3. Set up environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials
```

4. Initialize database
```bash
cd backend
npx prisma migrate dev
npm run db:seed
```

5. Start development servers
```bash
# From root directory
npm run dev
```

This starts both backend (port 5000) and frontend (port 5173).

### Demo Credentials

After seeding:
- **Shop Owner:** admin@patelxerox.com / admin123
- **Manager:** manager@patelxerox.com / manager123
- **Operator:** operator@patelxerox.com / operator123

## Project Structure

```
patel-autoprint/
├── backend/           # Express.js API server
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── utils/
│   │   └── server.js
│   └── prisma/
│       ├── schema.prisma
│       └── seed.js
├── frontend/          # React application
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── contexts/
│   │   ├── services/
│   │   └── utils/
│   └── index.html
├── print-agent/       # Windows Print Agent
│   └── src/
│       └── index.js
└── shared/            # Shared types & constants
    ├── types/
    └── constants/
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new shop
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/profile` - Get profile

### Orders
- `POST /api/v1/orders` - Create order
- `GET /api/v1/orders/queue` - Get order queue
- `GET /api/v1/orders/search` - Search orders
- `POST /api/v1/orders/:id/approve` - Approve order
- `POST /api/v1/orders/:id/hold` - Hold order
- `POST /api/v1/orders/:id/reject` - Reject order

### Files
- `POST /api/v1/files/upload/:orderId` - Upload files
- `GET /api/v1/files/order/:orderId` - Get order files
- `GET /api/v1/files/:fileId/analyze` - Analyze file

### Printers
- `GET /api/v1/printers` - List printers
- `POST /api/v1/printers` - Add printer
- `PUT /api/v1/printers/:id` - Update printer
- `DELETE /api/v1/printers/:id` - Delete printer

### Pricing
- `GET /api/v1/pricing` - List pricing rules
- `POST /api/v1/pricing` - Create pricing rule
- `POST /api/v1/pricing/calculate` - Calculate price

## Features

### Customer Portal
- Drag & drop file upload
- Multi-file support
- Independent print settings per file
- Mixed print rules
- Live preview
- Real-time pricing
- Multiple payment methods
- Order tracking
- Print again feature

### Admin Dashboard
- Real-time order queue
- Search by Order ID, Mobile, Name
- One-click approve/hold/reject
- Printer recommendation
- Revenue reports
- Customer management
- User management
- Pricing configuration

### Print Processing Engine
- Automatic file analysis
- Office document conversion
- N-up printing
- Image layouts
- PowerPoint layouts
- Duplex auto-detection
- Binding margins
- Watermarks
- Print-ready PDF generation

### Windows Print Agent
- Automatic printer discovery
- Silent printing
- Job queue management
- Retry logic
- Status monitoring
- Auto-update

## License

Proprietary - Patel AutoPrint

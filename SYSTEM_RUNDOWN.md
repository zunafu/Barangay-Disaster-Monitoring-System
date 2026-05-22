# Disaster Monitoring & Response System - Project Rundown

## 📋 System Overview
A comprehensive web-based platform for real-time disaster incident reporting, tracking, and management. The system enables citizens to report disasters, government agencies to respond, and administrators to oversee operations.

---

## 🎯 Core Features

### 1. **Incident Reporting & Management**
- Users can report disaster incidents with:
  - Disaster type (Fire, Flood, Earthquake, Typhoon, Landslide, Accident, Other)
  - Title and detailed description
  - Real-time location (GPS coordinates + address)
  - Image/photo evidence upload
  - Real-time incident map visualization

### 2. **Status Tracking System**
- **4-Stage Status Pipeline:**
  - **Reported** → Initial incident submission
  - **Responding** → Government agency dispatched
  - **In Area** → Response team arrived at location
  - **Resolved** → Incident handled and closed

- **Severity Levels:**
  - Low, Medium, High, Critical
  - Assigned by barangay officials or admins

### 3. **Real-Time Communication**
- **Comments** on incidents for discussion
- **Chat functionality** for team coordination
- **Announcements** for emergency broadcasts
- **Confirmations** - users can confirm reported incidents

### 4. **User Roles & Permissions**

| Role | Capabilities |
|------|--------------|
| **User** | Report incidents, comment, confirm incidents, view map |
| **Barangay** | Update incident status, assign severity, manage local incidents |
| **Admin** | Complete system control, user management, audit logs, statistics |

### 5. **Admin Dashboard**
- User management (create, edit, deactivate accounts)
- Dashboard statistics:
  - Total users & incidents
  - Active incidents (not resolved)
  - Recent incidents (past 7 days)
  - Deactivated & unverified accounts
- Statistics & analytics
- Audit logs with filtering
- Incident overview

### 6. **Audit & Security**
- Complete audit logging of all actions:
  - User creation/deletion/updates
  - Incident status changes
  - Comments and reactions
  - Admin operations
- IP tracking and user agent logging
- Role-based access control

---

## 🛠️ Technology Stack

### Frontend
- **HTML5** - Semantic structure
- **CSS3** - Responsive design (mobile, tablet, desktop)
- **JavaScript (Vanilla)** - Dynamic interactions, API calls
- **Font Awesome** - Icon library
- **Geoapify API** - Location geocoding & mapping

### Backend
- **PHP 7+** - Server-side logic
- **MySQL/MariaDB** - Database
- **PDO** - Secure database queries

### Architecture
- RESTful API endpoints
- Session-based authentication
- JSON response format

---

## 📊 Database Structure

### Core Tables
1. **users** - User accounts with roles
2. **incidents** - Disaster reports with location & status
3. **confirmations** - User confirmations on incidents
4. **comments** - Discussion threads on incidents
5. **comment_reactions** - Like/dislike on comments
6. **chat_messages** - Real-time team chat
7. **announcements** - Emergency announcements
8. **audit_logs** - Complete action history

---

## 📱 Key Pages & Functions

### Public/User Views
- **index.html** - Main dashboard with incident map
- **auth.php** - Login/register/authentication
- Incident detail page with comments & chat
- User profile/settings

### Admin Views
- **admin-panel.html** - Central management hub
  - Dashboard with key metrics
  - User Management table
  - Statistics & analytics
  - Audit logs with export

---

## ✨ Key Workflows

### Incident Reporting Workflow
1. User reports incident with location & details
2. Incident appears on public map
3. Barangay officials review & update status
4. Status progresses through pipeline
5. When resolved, marked as completed
6. Audit log records all changes

### Admin User Management Workflow
1. Admin creates new users with roles
2. Can edit user details and change roles
3. Can deactivate/reactivate accounts
4. View all user information & activity
5. All changes logged in audit trail

### Communication Flow
1. Users comment on incidents
2. Barangay/Admin can respond
3. Real-time notifications for updates
4. Chat for team coordination
5. Announcements for public alerts

---

## 🔒 Security Features

- ✅ Password hashing (PASSWORD_DEFAULT)
- ✅ Session-based authentication
- ✅ Role-based access control
- ✅ Email verification for users
- ✅ Audit logging for accountability
- ✅ Input validation & prepared statements (SQL injection prevention)
- ✅ Account deactivation (soft delete)

---

## 📈 Statistics & Reporting

System provides analytics on:
- Incident count by status
- Incident count by type
- Incident count by severity
- Active vs. resolved incidents
- User distribution by role
- Recent incident trends

---

## 🚀 Deployment

- **Server:** Apache/PHP Server (XAMPP)
- **Database:** MySQL
- **File Uploads:** /uploads directory
- **Location:** `/disaster-report/` directory

---

## 📋 File Structure

```
disaster-report/
├── index.html              # Main user dashboard
├── admin-panel.html        # Admin management interface
├── admin.php              # Admin API endpoints
├── api.php                # Main API endpoints
├── auth.php               # Authentication logic
├── app.js                 # Frontend JavaScript
├── config.php             # Database configuration
├── database/
│   └── seeds/
│       └── database-complete.sql  # Database schema
└── uploads/               # User uploaded images
```

---

## ✅ Current Status

**✓ Incident Reporting** - Fully functional  
**✓ Real-time Mapping** - Live incident visualization  
**✓ Status Updates** - 4-stage pipeline implemented  
**✓ User Management** - Complete admin controls  
**✓ Audit Logging** - Comprehensive action tracking  
**✓ Communication** - Comments, chat, announcements  
**✓ Authentication** - Secure login system  
**✓ Role-Based Access** - User, Barangay, Admin levels  
**✓ Responsive Design** - Works on all devices  

---

## 🎓 Key Achievements

1. **Real-Time Incident Tracking** - Live map updates as incidents are reported
2. **Multi-Role System** - Different access levels for different user types
3. **Complete Audit Trail** - Every action is logged for accountability
4. **Mobile Responsive** - Works seamlessly on phones, tablets, and desktops
5. **Scalable Architecture** - Can handle multiple concurrent incidents
6. **Disaster-Focused** - Tailored for emergency response scenarios

---

## 👥 User Statistics

- Multiple user roles (User, Barangay, Admin)
- User deactivation capability
- Email verification system
- Complete user activity tracking

---

## 📞 Support & Contact

For technical documentation, see individual PHP files.  
Database schema available in `database/seeds/database-complete.sql`

---

**System Version:** 1.0  
**Last Updated:** February 4, 2026

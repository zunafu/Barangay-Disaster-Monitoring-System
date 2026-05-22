# 🚨 Disaster Monitoring & Response System

A comprehensive web-based platform for real-time disaster incident reporting, tracking, and management. Enables citizens to report disasters, government agencies to respond, and administrators to oversee operations.

## ✨ Core Features

### 📍 Incident Reporting & Management
- Report disasters with type, location (GPS), photos, and descriptions
- Support for multiple disaster types: Fire, Flood, Earthquake, Typhoon, Landslide, Accident, Other
- Real-time incident map visualization
- Image/photo evidence upload

### 📊 Status Tracking System
**4-Stage Status Pipeline:**
- **Reported** → Initial incident submission
- **Responding** → Government agency dispatched
- **In Area** → Response team arrived at location
- **Resolved** → Incident handled and closed

**Severity Levels:** Low, Medium, High, Critical

### 💬 Real-Time Communication
- Comments and discussions on incidents
- Team chat functionality for coordination
- Emergency announcements/broadcasts
- Incident confirmation system

### 👥 Role-Based Access Control

| Role | Capabilities |
|------|--------------|
| **User** | Report incidents, comment, confirm incidents, view map |
| **Barangay** | Update incident status, assign severity, manage local incidents |
| **Admin** | Complete system control, user management, audit logs, statistics |

### 📈 Admin Dashboard
- User management (create, edit, deactivate accounts)
- Real-time statistics and analytics
- Audit logs with filtering
- Incident overview and insights

### 🔐 Audit & Security
- Complete audit logging of all system actions
- IP tracking and user agent logging
- Role-based access control
- Secure PDO database queries

## 🛠️ Technology Stack

### Frontend
- **HTML5** - Semantic structure
- **CSS3** - Responsive design (mobile, tablet, desktop)
- **JavaScript (Vanilla)** - Dynamic interactions and API calls
- **Font Awesome** - Icon library
- **Geoapify API** - Location geocoding and mapping

### Backend
- **PHP 7+** - Server-side logic
- **MySQL/MariaDB** - Database
- **PDO** - Secure database queries

### Architecture
- RESTful API endpoints
- Session-based authentication
- JSON response format

## 📋 Project Structure

```
disaster-report/
├── index.html              # Main landing page
├── admin-panel.html        # Administrator dashboard
├── barangay-panel.html     # Barangay officer interface
├── app.js                  # Frontend application logic
├── api.php                 # API endpoints
├── auth.php                # Authentication logic
├── admin.php               # Admin operations
├── reset-password.php      # Password recovery
├── settings.php            # User settings
├── config.php              # Configuration file
├── database/
│   ├── database.bak        # Database backup
│   └── seeds/
│       └── database-complete.sql  # Initial database schema & data
└── uploads/                # User-uploaded files
```

## 🚀 Getting Started

### Prerequisites
- PHP 7.0 or higher
- MySQL/MariaDB 5.7 or higher
- Web server (Apache, Nginx, etc.)
- Modern web browser

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/disaster-report.git
   cd disaster-report
   ```

2. **Setup database**
   - Create a new MySQL database
   - Import the schema:
     ```bash
     mysql -u username -p database_name < database/seeds/database-complete.sql
     ```

3. **Configure the application**
   - Copy and update `config.php` with your database credentials:
     ```php
     define('DB_HOST', 'localhost');
     define('DB_USER', 'your_db_user');
     define('DB_PASS', 'your_db_password');
     define('DB_NAME', 'disaster_report');
     ```

4. **Set file permissions**
   ```bash
   chmod 755 uploads/
   chmod 644 config.php
   ```

5. **Access the application**
   - Navigate to `http://localhost/disaster-report` in your browser

## 📚 API Documentation

The system provides RESTful API endpoints for all operations:

- **Incidents:** Create, read, update, retrieve by status/location
- **Users:** Authentication, profile management, role operations
- **Comments:** Post, read, add reactions
- **Chat:** Real-time messaging between team members
- **Announcements:** Create and retrieve emergency broadcasts
- **Audit Logs:** System-wide action history

Refer to `api_funcs.txt` for detailed API function reference.

## 🔑 Default Admin Account

After database setup, use these default credentials:
- **Username:** `admin`
- **Password:** `admin123`

⚠️ **Important:** Change the default password immediately in production!

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support & Contact

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact the development team at [your-email@example.com]

## 🙏 Acknowledgments

- Geoapify for location services
- Font Awesome for icons
- Community contributors and testers

---

**Built with ❤️ for disaster preparedness and community safety.**

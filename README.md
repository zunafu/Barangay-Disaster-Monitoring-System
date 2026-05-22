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

## 📸 Screenshots

### 👤 For Users
*Report incidents, view real-time map, confirm reports, and engage in discussions*

<div align="center">
<img width="1918" height="920" alt="User Dashboard" src="https://github.com/user-attachments/assets/4a752f8c-6e93-4a8d-94be-51af1ea3e563" />
<img width="1919" height="918" alt="Report Incident" src="https://github.com/user-attachments/assets/e6289504-1e5e-468e-b078-a58b6a918935" />
<img width="1919" height="920" alt="Incident Map" src="https://github.com/user-attachments/assets/2e6e2d74-05d8-4da6-a65f-01657333c983" />
<img width="1919" height="919" alt="Incident Details" src="https://github.com/user-attachments/assets/daf7bfdb-5612-4e07-8159-534b8b2c3d92" />
</div>

---

### 🏛️ For Barangay Officers
*Manage local incidents, update status, assign severity, and coordinate response*

<div align="center">
<img width="1918" height="919" alt="Barangay Dashboard" src="https://github.com/user-attachments/assets/0ad9c69e-eb97-468b-a394-b8cb366c984d" />
<img width="1919" height="919" alt="Incident Management" src="https://github.com/user-attachments/assets/5c255e7b-5647-4bc3-b51f-9179291e1b28" />
<img width="1919" height="916" alt="Status Updates" src="https://github.com/user-attachments/assets/a7d4f842-112a-48eb-8f30-63af4ec9a199" />
<img width="1919" height="921" alt="Severity Assignment" src="https://github.com/user-attachments/assets/c3e94192-527e-469f-8224-fcc3c7bd792a" />
</div>

---

### 🔐 For Administrators
*Complete system control, user management, audit logs, and comprehensive analytics*

<div align="center">
<img width="1919" height="919" alt="Admin Dashboard" src="https://github.com/user-attachments/assets/8cd1ac90-4633-40a5-bcc9-fa1c90c9abf3" />
<img width="1919" height="920" alt="User Management" src="https://github.com/user-attachments/assets/43820ab2-e1dd-4177-9647-72931f8554f4" />
<img width="1919" height="915" alt="System Statistics" src="https://github.com/user-attachments/assets/784baee2-4adf-4071-ad4d-a9fcead9a5f4" />
<img width="1919" height="919" alt="Audit Logs" src="https://github.com/user-attachments/assets/a8c99429-052d-413e-9565-565c07e0712d" />
<img width="1919" height="919" alt="Admin Controls" src="https://github.com/user-attachments/assets/7c94c74a-88b0-4b46-9527-53fff67170a2" />
</div>

---

### ✨ Added Features
*Enhanced mobile responsiveness, real-time notifications, and advanced filtering*

<div align="center">
<img width="371" height="917" alt="Mobile View 1" src="https://github.com/user-attachments/assets/39d7546b-bfbb-47e7-952f-4cb61edf84fa" />
<img width="361" height="916" alt="Mobile View 2" src="https://github.com/user-attachments/assets/de1f2584-5159-4627-91c3-f5f0e4f368d3" />
<img width="368" height="914" alt="Mobile View 3" src="https://github.com/user-attachments/assets/1f4b83c7-95e6-4d77-a26c-513545dcd4fc" />
<img width="1919" height="917" alt="Advanced Filtering" src="https://github.com/user-attachments/assets/54502d43-28f9-4528-acae-395a6affb14f" />
<img width="1919" height="917" alt="Real-time Updates" src="https://github.com/user-attachments/assets/6cc926fc-1eb6-4fcc-86e8-f96762007758" />
</div>



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
- Contact the development team at [franzgeoffrivera@gmail.com]

## 🙏 Acknowledgments

- Geoapify for location services
- Font Awesome for icons
- Community contributors and testers

---

**Built with ❤️ for disaster preparedness and community safety.**

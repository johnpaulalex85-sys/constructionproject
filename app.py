from flask import Flask, render_template, redirect, url_for
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import os

load_dotenv()

from routes.auth_routes import auth_bp
from routes.site_routes import site_bp
from routes.material_routes import material_bp
from routes.allocation_routes import allocation_bp
from routes.usage_routes import usage_bp
from routes.request_routes import request_bp
from routes.report_routes import report_bp
from routes.dashboard_routes import dashboard_bp
from routes.supervisor_routes import supervisor_bp
from routes.attendance_routes import attendance_bp
from routes.accounting_routes import accounting_bp
from routes.daily_reports_routes import daily_reports_bp

def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static")
    CORS(app) # Enable CORS for all routes

    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "fallback-secret")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES", 86400))

    JWTManager(app)

    # Page routes (serve HTML templates)
    @app.route("/")
    def login_page():
        return render_template("login.html")

    @app.route("/dashboard")
    def dashboard_page():
        return render_template("dashboard.html")

    # API blueprints
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(site_bp, url_prefix="/api")
    app.register_blueprint(material_bp, url_prefix="/api")
    app.register_blueprint(allocation_bp, url_prefix="/api")
    app.register_blueprint(usage_bp, url_prefix="/api")
    app.register_blueprint(request_bp, url_prefix="/api")
    app.register_blueprint(report_bp, url_prefix="/api")
    app.register_blueprint(dashboard_bp, url_prefix="/api")
    app.register_blueprint(supervisor_bp, url_prefix="/api")
    app.register_blueprint(attendance_bp, url_prefix="/api")
    app.register_blueprint(accounting_bp, url_prefix="/api")
    app.register_blueprint(daily_reports_bp, url_prefix="/api")

    @app.errorhandler(Exception)
    def handle_exception(e):
        from flask import jsonify
        from pymongo.errors import ServerSelectionTimeoutError
        error_msg = str(e)
        
        # Check for the specific MongoDB Atlas IP Whitelisting error
        if isinstance(e, ServerSelectionTimeoutError) and "TLSV1_ALERT_INTERNAL_ERROR" in error_msg:
            clean_msg = "Cannot connect to MongoDB Atlas. Please ensure your current IP address is whitelisted in your MongoDB Atlas Network Access dashboard."
            return jsonify(error=clean_msg, msg=clean_msg), 500
            
        # Return JSON instead of HTML for HTTP 500 errors
        return jsonify(error=error_msg, msg="An internal server error occurred."), 500

    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)

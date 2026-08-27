import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from workflow_routes import _send_email, EmailRequest

log = logging.getLogger("cron_jobs")

async def _missed_schedules_loop(db):
    """Background task that runs every 60 seconds to check if it's time to send missed schedule emails."""
    while True:
        try:
            now_local = datetime.now()
            
            # 1. Load settings
            settings = await db.settings.find_one({"_id": "global"}) or {}
            notifications = settings.get("notifications", {})
            if not notifications.get("enabled"):
                await asyncio.sleep(60)
                continue
                
            time_of_day = notifications.get("time_of_day", "08:00")
            current_time_str = now_local.strftime("%H:%M")
            
            # If it's exactly the minute they requested, run the job
            if current_time_str == time_of_day:
                today_str = now_local.strftime("%Y-%m-%d")
                
                # Prevent running multiple times in the same minute
                run_key = f"missed_schedules_{today_str}_{time_of_day}"
                run_log = await db.cron_logs.find_one({"_id": run_key})
                if not run_log:
                    await db.cron_logs.insert_one({"_id": run_key, "ran_at": now_local.isoformat()})
                    await _execute_missed_schedule_job(db, now_local, notifications)
                    
        except Exception as e:
            log.exception(f"Missed schedule cron loop error: {e}")
            
        await asyncio.sleep(60)

async def _execute_missed_schedule_job(db, now_local, notifications):
    log.info("Executing daily missed/delayed schedules job...")
    
    # 1. Find all sites
    sites = await db.sites.find({}).to_list(None)
    site_map = {s["site_code"]: s for s in sites if "site_code" in s}
    
    # 2. Find all non-approved schedules
    # (draft, submitted, pending, etc.) - meaning not completed
    pipeline = [
        {"$match": {
            "schedule.status": {"$ne": "approved"},
            "schedule.planned_date": {"$exists": True, "$ne": None}
        }}
    ]
    cycles = await db.site_cycles.aggregate(pipeline).to_list(None)
    
    vendor_missed_groups = {}
    
    today_date = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    
    to_col = notifications.get("email_to_column", "vendor_email")
    cc_col = notifications.get("email_cc_column", "cc_email")
    
    for cyc in cycles:
        try:
            sch_date_str = cyc["schedule"]["planned_date"]
            sch_date = datetime.strptime(sch_date_str, "%Y-%m-%d")
            diff_days = (today_date - sch_date).days
            
            site = site_map.get(cyc.get("site_code"))
            if not site:
                continue
                
            vendor_email = site.get(to_col) or site.get("vendor_email")
            cc_email = site.get(cc_col, "")
            vendor_login_user = site.get("vendor_login_user")
            
            if diff_days > 7 and vendor_email:
                # Missed (> 7 days) -> Group for email
                key = (vendor_email, cc_email)
                if key not in vendor_missed_groups:
                    vendor_missed_groups[key] = []
                vendor_missed_groups[key].append({
                    "site_name": site.get("site_name", "Unknown Site"),
                    "activity": cyc.get("activity", "Unknown Activity"),
                    "planned_date": sch_date_str,
                    "diff_days": diff_days
                })
            
            elif diff_days > 2 and vendor_login_user:
                # Delayed (> 2 days) -> In-app notification
                # Prevent spamming the same notification daily by checking if we sent one recently
                notif_key = f"delayed_{cyc['cycle_id']}"
                existing = await db.notifications.find_one({"_id": notif_key})
                if not existing:
                    await db.notifications.insert_one({
                        "_id": notif_key,
                        "user_id": vendor_login_user,
                        "title": "Schedule Delayed",
                        "message": f"{site.get('site_name', '')} - {cyc.get('activity', '')} is delayed by {diff_days} days.",
                        "type": "warning",
                        "read": False,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                    
        except Exception:
            continue
            
    # 3. Send grouped emails
    month_year = now_local.strftime("%B/%Y")
    
    # Load templates from settings, fallback to defaults
    subj_tmpl = notifications.get("email_subject") or "Schedule Missed - {{month_year}}"
    body_tmpl = notifications.get("email_body_html") or "<p>The following schedules are more than 7 days overdue:</p><br/>{{missed_table}}"
    
    for (to_email, cc_email), missed_list in vendor_missed_groups.items():
        subject = subj_tmpl.replace("{{month_year}}", month_year)
        
        # Build HTML table
        html_rows = ""
        for item in missed_list:
            html_rows += f"""
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">{item['site_name']}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">{item['activity']}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">{item['planned_date']}</td>
                <td style="padding: 8px; border: 1px solid #ddd; color: red;">{item['diff_days']} days</td>
            </tr>
            """
            
        table_html = f"""
        <table style="border-collapse: collapse; width: 100%;">
            <thead>
                <tr style="background-color: #f3f4f6;">
                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Site Name</th>
                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Activity</th>
                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Scheduled Date</th>
                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Overdue By</th>
                </tr>
            </thead>
            <tbody>
                {html_rows}
            </tbody>
        </table>
        """
        
        html = body_tmpl.replace("{{month_year}}", month_year).replace("{{missed_table}}", table_html)
        
        to_list = [e.strip() for e in to_email.replace(";", ",").split(",") if e.strip()]
        cc_list = [e.strip() for e in cc_email.replace(";", ",").split(",") if e.strip()] if cc_email else []
        
        if to_list:
            req = EmailRequest(
                to=to_list,
                cc=cc_list,
                subject=subject,
                body_html=html
            )
            await _send_email(db, req)
            log.info(f"Sent missed schedule email to {to_list} (cc: {cc_list}) with {len(missed_list)} items.")

def start_missed_schedules_cron(db):
    return asyncio.create_task(_missed_schedules_loop(db))


# ─────────────────────────────────────── PDF Retention Lifecycle Cron ──────

async def _pdf_retention_loop(db):
    """
    Background task that runs once per day at 02:00 local time to automatically
    purge expired completed PDF files from disk according to each form's
    retention policy.

    MongoDB submission data is NEVER deleted — only the static .pdf file.
    On-demand PDF regeneration remains available for all submissions.
    """
    while True:
        try:
            now_local = datetime.now()
            # Run once daily at 02:00
            if now_local.strftime("%H:%M") == "02:00":
                run_key = f"pdf_retention_{now_local.strftime('%Y-%m-%d')}"
                existing = await db.cron_logs.find_one({"_id": run_key})
                if not existing:
                    await db.cron_logs.insert_one({"_id": run_key, "ran_at": now_local.isoformat()})
                    try:
                        from retention_routes import _execute_retention_cleanup
                        result = await _execute_retention_cleanup(db, dry_run=False)
                        log.info(
                            f"PDF Retention cron: scanned={result.forms_scanned} "
                            f"deleted={result.files_deleted} "
                            f"freed={result.bytes_freed / 1024 / 1024:.2f}MB "
                            f"errors={len(result.errors)}"
                        )
                        if result.errors:
                            for err in result.errors[:5]:
                                log.warning(f"Retention error: {err}")
                    except Exception as e:
                        log.exception(f"PDF retention cleanup failed: {e}")
        except Exception as e:
            log.exception(f"PDF retention cron loop error: {e}")
        await asyncio.sleep(60)


def start_pdf_retention_cron(db):
    return asyncio.create_task(_pdf_retention_loop(db))

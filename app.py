import os
import random
import string
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)  #         

# ==============================================================================
#  1.    (DATABASE CONNECTION)
# ==============================================================================
DEFAULT_MONGO = "mongodb+srv://arena_user:Arena999@cluster0.pluvfcd.mongodb.net/central_wallet_db?appName=Cluster0"
MONGO_URI = os.environ.get("MONGO_URI", DEFAULT_MONGO)

try:
    client = MongoClient(MONGO_URI)
    db = client['central_wallet_db']
    
    users_col = db['users']
    trans_col = db['transactions']
    game_sync_col = db['game_sync_requests']
    admin_col = db['admin_settings']
    print(" MongoDB Connected Successfully!")
except Exception as e:
    print(f" Database Connection Failed: {e}")

# Unique UID     (: CW10294)
def generate_unique_uid():
    while True:
        random_num = "".join(random.choices(string.digits, k=5))
        uid = f"CW{random_num}"
        if not users_col.find_one({"uid": uid}):
            return uid

#      
def generate_invite_code(first_name):
    clean_name = "".join(e for e in first_name if e.isalnum()).upper()[:4]
    random_num = "".join(random.choices(string.digits, k=4))
    return f"{clean_name}{random_num}"

#    
@app.route('/api/auth/register', methods=['POST'])
def register_user():
    data = request.get_json() or {}
    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()
    gmail = data.get('gmail', '').strip().lower()
    mobile = data.get('mobile', '').strip()
    password = data.get('password', '')
    confirm_password = data.get('confirm_password', '')
    invite_code_used = data.get('invite_code', '').strip().upper()

    if not first_name or not gmail or len(mobile) != 10 or not password:
        return jsonify({"success": False, "message": "     !"}), 400

    if password != confirm_password:
        return jsonify({"success": False, "message": "     !"}), 400

    if users_col.find_one({"mobile": mobile}):
        return jsonify({"success": False, "message": "      !"}), 400
    if users_col.find_one({"gmail": gmail}):
        return jsonify({"success": False, "message": " Gmail ID    !"}), 400

    promoter_uid = None
    if invite_code_used:
        promoter = users_col.find_one({"invite_code": invite_code_used})
        if promoter:
            promoter_uid = promoter['uid']
            users_col.update_one({"uid": promoter_uid}, {"$inc": {"balance": 5.0}})
            trans_col.insert_one({
                "uid": promoter_uid, "type": "referral_bonus", "amount": 5.0,
                "status": "Success", "remark": f"Bonus for inviting {mobile}", "created_at": datetime.utcnow()
            })

    new_uid = generate_unique_uid()
    new_invite_code = generate_invite_code(first_name)
    hashed_password = generate_password_hash(password)

    user_doc = {
        "uid": new_uid, "first_name": first_name, "last_name": last_name,
        "gmail": gmail, "mobile": mobile, "password": hashed_password,
        "mpin": "1234", "balance": 0.0, "invite_code": new_invite_code,
        "referred_by": promoter_uid, "status": "Active", "shake_to_scan": False, "created_at": datetime.utcnow()
    }
    users_col.insert_one(user_doc)
    return jsonify({"success": True, "message": " !", "uid": new_uid}), 201
    # ==============================================================================
#  2.   (3-WAY LOGIN AUTH - UID, MOBILE OR GMAIL)
# ==============================================================================

@app.route('/api/auth/login', methods=['POST'])
def login_user():
    data = request.get_json() or {}
    login_key = data.get('login_key', '').strip()
    password = data.get('password', '')

    if not login_key or not password:
        return jsonify({"success": False, "message": " -    !"}), 400

    # 3-     (UID, Mobile  Gmail)
    user = users_col.find_one({
        "$or": [
            {"uid": login_key},
            {"mobile": login_key},
            {"gmail": login_key.lower()}
        ]
    })

    if not user:
        return jsonify({"success": False, "message": "  !    "}), 404

    if user.get("status") == "Banned":
        return jsonify({"success": False, "message": "    /Banned    !"}), 403

    #   
    if check_password_hash(user['password'], password):
        return jsonify({
            "success": True,
            "message": " !",
            "user": {
                "uid": user['uid'],
                "first_name": user['first_name'],
                "last_name": user['last_name'],
                "mobile": user['mobile'],
                "gmail": user['gmail'],
                "invite_code": user['invite_code'],
                "shake_to_scan": user.get('shake_to_scan', False)
            }
        }), 200
    else:
        return jsonify({"success": False, "message": " !    "}), 401


# ==============================================================================
#  3.    (BALANCE & NEW "TO UPI" GAME FEATURE)
# ==============================================================================

# (A)    (To Mobile / UID Search )
@app.route('/api/wallet/search-user', methods=['POST'])
def search_user():
    data = request.get_json() or {}
    search_query = data.get('query', '').strip()

    user = users_col.find_one({
        "$or": [
            {"uid": search_query},
            {"mobile": search_query}
        ]
    })

    if user:
        return jsonify({
            "success": True, 
            "user_found": True, 
            "name": f"{user['first_name']} {user['last_name']}",
            "uid": user['uid']
        }), 200
    else:
        return jsonify({
            "success": False, 
            "user_found": False, 
            "message": "Central Wallet     UID     "
        }), 200

# (B)     (Check Balance with MPIN Lock)
@app.route('/api/wallet/check-balance', methods=['POST'])
def check_balance():
    data = request.get_json() or {}
    uid = data.get('uid', '').strip()
    mpin = data.get('mpin', '').strip()

    user = users_col.find_one({"uid": uid})
    if not user:
        return jsonify({"success": False, "message": "  !"}), 404

    if user.get('mpin') == mpin:
        return jsonify({"success": True, "balance": float(user.get('balance', 0.0))}), 200
    else:
        return jsonify({"success": False, "message": "  MPIN!     "}), 401

# (C)   : "To UPI"  (      UPI    )
@app.route('/api/wallet/pay-to-upi', methods=['POST'])
def pay_to_upi():
    data = request.get_json() or {}
    sender_uid = data.get('sender_uid', '').strip()
    game_upi_id = data.get('game_upi_id', '').strip()
    mpin = data.get('mpin', '').strip()

    sender = users_col.find_one({"uid": sender_uid})
    if not sender:
        return jsonify({"success": False, "message": "     !"}), 404

    if sender.get('mpin') != mpin:
        return jsonify({"success": False, "message": " MPIN!  "}), 401

    #      UPI         
    sync_req = game_sync_col.find_one({"game_upi_id": game_upi_id, "status": "Pending"})
    if not sync_req:
        return jsonify({"success": False, "message": " UPI           !"}), 400

    amount_to_pay = float(sync_req['amount'])

    if float(sender.get('balance', 0.0)) < amount_to_pay:
        return jsonify({"success": False, "message": "     !"}), 400

    # 1.       
    users_col.update_one({"uid": sender_uid}, {"$inc": {"balance": -amount_to_pay}})

    # 2.     'Success'  
    game_sync_col.update_one({"game_upi_id": game_upi_id}, {
        "$set": {
            "status": "Success",
            "paid_by_uid": sender_uid,
            "updated_at": datetime.utcnow()
        }
    })

    # 3.      
    trans_col.insert_one({
        "uid": sender_uid, "type": "Game_Deposit_Via_UPI", "amount": amount_to_pay,
        "status": "Success", "remark": f"Sent to game ID {sync_req.get('game_id')}", "created_at": datetime.utcnow()
    })

    return jsonify({"success": True, "message": f" {amount_to_pay}  !"}), 200
    # ==============================================================================
#  4.     (DYNAMIC RANDOM QR & UPI GENERATOR ROUTE)
# ==============================================================================
#        ,           
@app.route('/api/game/generate-request', methods=['POST'])
def generate_game_request():
    data = request.get_json() or {}
    game_id = data.get('game_id', '').strip()
    amount = float(data.get('amount', 0))

    if not game_id or amount <= 0:
        return jsonify({"success": False, "message": "    !"}), 400

    #  6-      UPI   
    random_token = "".join(random.choices(string.digits, k=6))
    generated_upi = f"pay-game-{random_token}@cw"

    #          
    sync_doc = {
        "game_id": game_id,
        "amount": amount,
        "game_upi_id": generated_upi,
        "status": "Pending",
        "created_at": datetime.utcnow()
    }
    game_sync_col.insert_one(sync_doc)

    return jsonify({
        "success": True,
        "game_upi_id": generated_upi,
        "qr_data_string": f"upi://pay?pa={generated_upi}&am={amount}&tn=GameLoad"
    }), 200

# ==============================================================================
#  5.   (ADVANCED MANAGEMENT & LIVE STATISTICS VIEW)
# ==============================================================================

#     (       )
@app.route('/api/admin/dashboard', methods=['POST'])
def get_admin_dashboard():
    data = request.get_json() or {}
    admin_user = data.get('username', '')
    admin_pass = data.get('password', '')

    #       
    if admin_user != "admin" or admin_pass != "Parveen999":
        return jsonify({"success": False, "message": " !   "}), 401

    #   (Live Information Calculations)
    total_users_count = users_col.count_documents({})
    
    #     
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    new_accounts_today = users_col.count_documents({"created_at": {"$gte": today_start}})

    #         (Pipelining)
    pipeline_dep = [{"$match": {"type": "add_money", "status": "Success"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    pipeline_wit = [{"$match": {"type": "withdrawal", "status": "Success"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    
    total_deposit = list(trans_col.aggregate(pipeline_dep))
    total_withdraw = list(trans_col.aggregate(pipeline_wit))

    dep_sum = total_deposit[0]['total'] if total_deposit else 0.0
    wit_sum = total_withdraw[0]['total'] if total_withdraw else 0.0

    #           
    raw_users_list = []
    all_users = users_col.find({}, {"_id": 0, "uid": 1, "mobile": 1, "gmail": 1, "first_name": 1, "last_name": 1, "balance": 1, "status": 1})
    for u in all_users:
        raw_users_list.append({
            "uid": u.get("uid"),
            "name": f"{u.get('first_name')} {u.get('last_name')}",
            "mobile": u.get("mobile"),
            "gmail": u.get("gmail"),
            "balance": u.get("balance", 0.0),
            "status": u.get("status", "Active"),
            "password_hash_hidden": " Protected By Encryption"
        })

    return jsonify({
        "success": True,
        "statistics": {
            "total_users": total_users_count,
            "new_users_today": new_accounts_today,
            "total_deposited_money": dep_sum,
            "total_withdrawn_money": wit_sum
        },
        "users_data_table": raw_users_list
    }), 200

if __name__ == '__main__':
    #           
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
    
from flask import Flask, render_template, request, jsonify
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from transformers import pipeline
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense
import warnings
from sklearn.cluster import KMeans
warnings.filterwarnings('ignore')

app = Flask(__name__)

# Initialize NLP classifier
classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
charity_categories = ['Education', 'Health', 'Environment', 'Poverty Alleviation', 'Animal Welfare']

# Categories and initial budgets
categories = ['Food', 'Transportation', 'Entertainment', 'Utilities', 'Shopping', 'Subscriptions', 'Healthcare', 'Other']
initial_budgets = {
    'Food': 500,
    'Transportation': 200,
    'Entertainment': 150,
    'Utilities': 100,
    'Shopping': 200,
    'Subscriptions': 50,
    'Healthcare': 100,
    'Other': 100
}

# User data storage
user_data = {
    'transactions': [],
    'budgets': initial_budgets.copy(),
    'feedback': []
}
user_data['charity_history'] = []

# Initialize RL model parameters
rl_params = {
    'state': list(initial_budgets.values()),
    'action_space': [0.9, 1.0, 1.1],
    'q_table': np.zeros((8, 3)),
    'learning_rate': 0.1,
    'discount_factor': 0.9,
    'exploration_rate': 0.3
}

# Initialize LSTM model
def create_lstm_model():
    model = Sequential()
    model.add(LSTM(50, activation='relu', input_shape=(3, 1)))
    model.add(Dense(1))
    model.compile(optimizer='adam', loss='mse')
    return model

lstm_model = create_lstm_model()

@app.route('/')
def index():
    return render_template('index.html', 
                         categories=categories,
                         budgets=user_data['budgets'],
                         initial_budgets=initial_budgets,
                         transactions=user_data['transactions'][-5:],
                         charity_categories=charity_categories)

@app.route('/categorize', methods=['POST'])
def categorize_expense():
    data = request.json
    description = data['description']
    amount = float(data['amount'])
    
    # Get classification from NLP model
    result = classifier(description, categories)
    predicted_category = result['labels'][0]
    confidence = result['scores'][0]
    
    # If confidence is low, return "uncertain" to prompt user
    if confidence < 0.7:
        return jsonify({
            'status': 'uncertain',
            'description': description,
            'amount': amount,
            'suggested_category': predicted_category,
            'confidence': f"{confidence*100:.1f}%",
            'categories': categories
        })
    
    # Add to transactions
    transaction = {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'description': description,
        'amount': amount,
        'category': predicted_category,
        'confidence': confidence
    }
    user_data['transactions'].append(transaction)
    
    # Update budgets
    user_data['budgets'][predicted_category] -= amount
    
    return jsonify({
        'status': 'success',
        'transaction': transaction,
        'remaining_budget': user_data['budgets'][predicted_category]
    })

@app.route('/confirm_category', methods=['POST'])
def confirm_category():
    data = request.json
    description = data['description']
    amount = float(data['amount'])
    category = data['category']
    
    # Add to transactions
    transaction = {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'description': description,
        'amount': amount,
        'category': category,
        'confidence': 1.0  # User confirmed
    }
    user_data['transactions'].append(transaction)
    
    # Update budgets
    user_data['budgets'][category] -= amount
    
    # Store feedback for model improvement
    user_data['feedback'].append({
        'description': description,
        'correct_category': category
    })
    
    return jsonify({
        'status': 'success',
        'transaction': transaction,
        'remaining_budget': user_data['budgets'][category]
    })
@app.route('/get_budget_adjustment', methods=['GET'])
def get_budget_adjustment():
    # Analyze all categories
    category_analysis = []
    for category in categories:
        spent = initial_budgets[category] - user_data['budgets'][category]
        spending_ratio = spent / initial_budgets[category]
        
        category_analysis.append({
            'category': category,
            'current_budget': initial_budgets[category],
            'spent': spent,
            'remaining': user_data['budgets'][category],
            'spending_ratio': spending_ratio,
            'overspent': user_data['budgets'][category] < 0,
            'underutilized': spending_ratio < 0.5  # Using less than 50% of budget
        })
    
    # Priority 1: Overspent categories
    overspent = [x for x in category_analysis if x['overspent']]
    # Priority 2: Categories nearing limit (>80% spent)
    nearing_limit = [x for x in category_analysis if not x['overspent'] and x['spending_ratio'] > 0.8]
    # Priority 3: Underutilized categories (<50% spent)
    underutilized = [x for x in category_analysis if x['underutilized'] and not x['overspent']]
    
    # Determine which adjustment to suggest
    if overspent:
        # Sort by most overspent first
        overspent.sort(key=lambda x: x['remaining'])
        adjustment = overspent[0]
        # For overspent categories, suggest at least 20% increase
        suggested_change = max(1.2, (adjustment['spent'] / 0.8) / adjustment['current_budget'])
        action_type = 'increase'
        reason = 'overspent'
    elif nearing_limit:
        # Sort by highest spending ratio first
        nearing_limit.sort(key=lambda x: -x['spending_ratio'])
        adjustment = nearing_limit[0]
        # Calculate needed increase to reach 80% utilization
        suggested_change = min(1.5, (adjustment['spent'] / 0.8) / adjustment['current_budget'])
        action_type = 'increase'
        reason = 'nearing_limit'
    elif underutilized:
        # Sort by lowest spending ratio first
        underutilized.sort(key=lambda x: x['spending_ratio'])
        adjustment = underutilized[0]
        # Suggest decrease proportional to underutilization (but max 30% decrease)
        utilization = adjustment['spending_ratio']
        suggested_change = max(0.7, 0.5 + (utilization / 2))  # Maps 0-0.5 utilization to 0.7-0.75
        action_type = 'decrease'
        reason = 'underutilized'
    else:
        return jsonify({
            'status': 'no_adjustment_needed',
            'message': 'All budgets are within optimal ranges'
        })
    
    # Get the closest action from our action space
    category_index = categories.index(adjustment['category'])
    action_index = np.argmin([abs(suggested_change - a) for a in rl_params['action_space']])
    action = rl_params['action_space'][action_index]
    
    # Calculate suggested new budget
    suggested_budget = initial_budgets[adjustment['category']] * action
    
    return jsonify({
        'status': 'adjustment_needed',
        'category': adjustment['category'],
        'current_budget': adjustment['current_budget'],
        'spent': adjustment['spent'],
        'remaining': adjustment['remaining'],
        'suggested_budget': suggested_budget,
        'action': action_type,
        'reason': reason,
        'details': f"Category is {reason.replace('_', ' ')} (used {adjustment['spending_ratio']*100:.1f}% of budget)"
    })



@app.route('/apply_budget_adjustment', methods=['POST'])
def apply_budget_adjustment():
    data = request.json
    category = data['category']
    action = data['action']
    
    # Get current spending info for RL reward calculation
    spent = initial_budgets[category] - user_data['budgets'][category]
    was_overspent = user_data['budgets'][category] < 0
    
    # Update initial budget
    if action == 'increase':
        initial_budgets[category] *= 1.1
    elif action == 'decrease':
        initial_budgets[category] *= 0.9
    
    # Update RL model
    category_index = categories.index(category)
    action_index = 0 if action == 'decrease' else 1 if action == 'maintain' else 2
    
    # Calculate reward based on whether this will help with overspending
    new_budget_ratio = (initial_budgets[category] - user_data['budgets'][category]) / initial_budgets[category]
    
    if was_overspent:
        reward = 1 if action == 'increase' else -1
    else:
        if new_budget_ratio < 0.8:
            reward = 1  # Good adjustment
        else:
            reward = -0.5  # Didn't help enough
    
    # Update Q-table
    current_q = rl_params['q_table'][category_index, action_index]
    max_future_q = np.max(rl_params['q_table'][category_index])
    new_q = (1 - rl_params['learning_rate']) * current_q + \
            rl_params['learning_rate'] * (reward + rl_params['discount_factor'] * max_future_q)
    rl_params['q_table'][category_index, action_index] = new_q
    
    # Also reset the current budget for this category
    user_data['budgets'][category] = initial_budgets[category]
    
    return jsonify({
        'status': 'success', 
        'new_budget': initial_budgets[category],
        'remaining': user_data['budgets'][category]
    })

@app.route('/get_forecast', methods=['GET'])
def get_forecast():
    # Check if we have enough transactions (reduced from 10 to 3)
    if len(user_data['transactions']) < 3:
        return jsonify({
            'status': 'not_enough_data',
            'message': f'You have {len(user_data["transactions"])} transactions. You need at least 3 transactions to generate a spending forecast.'
        })
    
    try:
        # Create DataFrame from transactions
        df = pd.DataFrame(user_data['transactions'])
        
        # If all transactions are from the same day, create artificial sequence
        if len(df['date'].unique()) == 1:
            # Create a sequence of the last 3 transactions
            last_transactions = df['amount'].values[-3:]
            if len(last_transactions) < 3:
                # Pad with zeros if we don't have enough transactions
                last_transactions = np.pad(last_transactions, (3 - len(last_transactions), 0), 'constant')
            
            # Predict next 3 days using the same pattern
            avg_spending = np.mean(last_transactions)
            forecasts = [avg_spending * 0.9, avg_spending, avg_spending * 1.1]  # Simple forecast
            
            # Create dates for forecast
            last_date = pd.to_datetime(df['date'].iloc[0])
            forecast_dates = [last_date + timedelta(days=i+1) for i in range(3)]
            
            return jsonify({
                'status': 'success',
                'forecast': [{'date': d.strftime('%Y-%m-%d'), 'amount': float(a)} for d, a in zip(forecast_dates, forecasts)],
                'message': 'Forecast based on same-day transactions'
            })
        
        # For multiple days, use the original approach
        df['date'] = pd.to_datetime(df['date'])
        daily_spending = df.groupby('date')['amount'].sum().reset_index()
        
        # Create complete date range
        date_range = pd.date_range(
            start=daily_spending['date'].min(),
            end=daily_spending['date'].max()
        )
        
        # Reindex to fill missing dates with 0
        daily_spending = daily_spending.set_index('date') \
            .reindex(date_range) \
            .fillna(0) \
            .reset_index()
        daily_spending.columns = ['date', 'amount']
        
        # Create sequences for LSTM
        sequence_length = min(3, len(daily_spending))
        X, y = [], []
        for i in range(len(daily_spending) - sequence_length):
            X.append(daily_spending['amount'].values[i:i+sequence_length])
            y.append(daily_spending['amount'].values[i+sequence_length])
        
        if len(X) == 0:
            # If we still don't have sequences, use the last 3 values
            last_values = daily_spending['amount'].values[-3:]
            if len(last_values) < 3:
                last_values = np.pad(last_values, (3 - len(last_values), 0), 'constant')
            X = [last_values]
            y = [np.mean(last_values)]
        
        X = np.array(X).reshape(-1, sequence_length, 1)
        y = np.array(y)
        
        # Train model (in real app, do this separately)
        lstm_model.fit(X, y, epochs=10, verbose=0)
        
        # Predict next 3 days
        last_sequence = daily_spending['amount'].values[-sequence_length:]
        forecasts = []
        for _ in range(3):
            next_pred = lstm_model.predict(last_sequence.reshape(1, sequence_length, 1))[0,0]
            forecasts.append(max(0, next_pred))
            last_sequence = np.append(last_sequence[1:], next_pred)
        
        # Create dates for forecast
        last_date = daily_spending['date'].max()
        forecast_dates = [last_date + timedelta(days=i+1) for i in range(3)]
        
        return jsonify({
            'status': 'success',
            'forecast': [{'date': d.strftime('%Y-%m-%d'), 'amount': float(a)} for d, a in zip(forecast_dates, forecasts)]
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'transactions_count': len(user_data['transactions'])
        })
    




# Add this route for charity suggestions
@app.route('/get_charity_suggestion', methods=['GET'])
def get_charity_suggestion():
    if len(user_data['transactions']) < 5:
        return jsonify({
            'status': 'not_enough_data',
            'message': 'We need at least 5 transactions to make charity suggestions'
        })
    
    # Analyze spending patterns using K-Means clustering
    amounts = np.array([t['amount'] for t in user_data['transactions']]).reshape(-1, 1)
    kmeans = KMeans(n_clusters=3, random_state=42).fit(amounts)
    
    # Get cluster centers (small, medium, large transactions)
    clusters = sorted(kmeans.cluster_centers_.flatten())
    
    # Suggested charity amount is 5% of medium-sized transactions
    suggested_amount = round(float(clusters[1] * 0.05), 2)
    
    # Get most underutilized budget category to suggest reallocation
    budget_utilization = []
    for cat in categories:
        spent = initial_budgets[cat] - user_data['budgets'][cat]
        utilization = spent / initial_budgets[cat]
        budget_utilization.append((cat, utilization))
    
    # Sort by lowest utilization
    budget_utilization.sort(key=lambda x: x[1])
    suggested_reallocation = budget_utilization[0][0]
    
    return jsonify({
        'status': 'success',
        'suggested_amount': suggested_amount,
        'suggested_categories': charity_categories,
        'suggested_reallocation': suggested_reallocation,
        'message': f"Based on your spending patterns, we suggest donating ${suggested_amount}"
    })

# Add to your existing imports
from datetime import datetime, timedelta

# Add with other initializations
charity_categories = ['Education', 'Health', 'Environment', 'Poverty Alleviation', 'Animal Welfare']

# Update the process_charity route
@app.route('/process_charity', methods=['POST'])
def process_charity():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'No data provided'}), 400

        amount = float(data.get('amount', 0))
        category = data.get('category', '').strip()
        reallocation_category = data.get('reallocation_category', '').strip() or None

        # Validate inputs
        if amount <= 0:
            return jsonify({'status': 'error', 'message': 'Amount must be positive'}), 400
        
        if not category or category not in charity_categories:
            return jsonify({'status': 'error', 'message': 'Invalid charity category'}), 400

        # Check if reallocation is needed and valid
        if reallocation_category:
            if reallocation_category not in categories:
                return jsonify({'status': 'error', 'message': 'Invalid reallocation category'}), 400
            
            if user_data['budgets'].get(reallocation_category, 0) < amount:
                return jsonify({
                    'status': 'error',
                    'message': f'Not enough budget in {reallocation_category} to reallocate'
                }), 400
            
            # Perform reallocation
            user_data['budgets'][reallocation_category] -= amount

        # Record charity donation as both charity and transaction
        donation = {
            'date': datetime.now().strftime('%Y-%m-%d'),
            'description': f"Donation to {category}",
            'amount': -amount,  # Negative amount for display purposes
            'category': 'Charity',
            'charity_category': category,
            'reallocation_category': reallocation_category,
            'confidence': 1.0
        }
        user_data['charity_history'].append(donation)
        user_data['transactions'].append(donation)

        return jsonify({
            'status': 'success',
            'donation': donation,
            'updated_budgets': user_data['budgets'],
            'new_transaction': donation,
            'message': 'Thank you for your donation!'
        })

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'An error occurred: {str(e)}'
        }), 500


if __name__ == '__main__':
    app.run(debug=True)

document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const transactionForm = document.getElementById('transactionForm');
    const categoryModal = document.getElementById('categoryModal');
    const categoryForm = document.getElementById('categoryForm');
    const adjustmentModal = document.getElementById('adjustmentModal');
    const getForecastBtn = document.getElementById('getForecastBtn');
    const getAdjustmentBtn = document.getElementById('getAdjustmentBtn');
    const acceptAdjustment = document.getElementById('acceptAdjustment');
    const rejectAdjustment = document.getElementById('rejectAdjustment');
    const recommendationsContainer = document.getElementById('recommendationsContainer');
    
    // Close modals when clicking X
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
    
    // Handle transaction form submission
    transactionForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const description = document.getElementById('description').value;
        const amount = parseFloat(document.getElementById('amount').value);
        
        // Validate amount
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid positive amount');
            return;
        }
        
        // Send to server for categorization
        fetch('/categorize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: description,
                amount: amount
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'uncertain') {
                // Show modal for user to confirm category
                document.getElementById('modalDescription').textContent = description;
                document.getElementById('modalAmount').textContent = amount.toFixed(2);
                document.getElementById('modalSuggestedCategory').textContent = data.suggested_category;
                document.getElementById('modalConfidence').textContent = data.confidence;
                document.getElementById('categorySelect').value = data.suggested_category;
                categoryModal.style.display = 'block';
            } else {
                // Transaction added successfully
                addRecommendation({
                    title: 'Transaction Added',
                    message: `Your ${data.transaction.category} transaction was added successfully. $${data.remaining_budget.toFixed(2)} remaining in this category.`
                });
                // Reload the page to show updated data
                setTimeout(() => location.reload(), 1500);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while adding the transaction');
        });
    });
    
    // Handle category confirmation
    categoryForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const description = document.getElementById('modalDescription').textContent;
        const amount = parseFloat(document.getElementById('modalAmount').textContent);
        const category = document.getElementById('categorySelect').value;
        
        fetch('/confirm_category', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: description,
                amount: amount,
                category: category
            })
        })
        .then(response => response.json())
        .then(data => {
            categoryModal.style.display = 'none';
            addRecommendation({
                title: 'Transaction Added',
                message: `Your ${data.transaction.category} transaction was added successfully. $${data.remaining_budget.toFixed(2)} remaining in this category.`
            });
            // Reload the page to show updated data
            setTimeout(() => location.reload(), 1500);
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while confirming the category');
        });
    });
    
    // Handle get forecast button
// Handle get forecast button
getForecastBtn.addEventListener('click', function() {
    fetch('/get_forecast')
    .then(response => response.json())
    .then(data => {
        if (data.status === 'not_enough_data') {
            addRecommendation({
                title: 'Not Enough Data',
                message: data.message || 'You need at least 3 transactions to generate a spending forecast.'
            });
        } else if (data.status === 'success') {
            // Format forecast data
            const forecastList = data.forecast.map(item => 
                `<li>${item.date}: $${item.amount.toFixed(2)}</li>`
            ).join('');
            
            const message = data.message ? `<p class="forecast-note">${data.message}</p>` : '';
            
            const content = `
                <div class="adjustment-suggestion">
                    <h3><i class="fas fa-chart-line"></i> 3-Day Spending Forecast</h3>
                    <p>Based on your spending patterns, here's what to expect:</p>
                    <ul>${forecastList}</ul>
                    ${message}
                    <p>Plan your budget accordingly!</p>
                </div>
            `;
            
            addRecommendation({
                title: 'Spending Forecast Generated',
                message: content,
                isHTML: true
            });
        } else {
            addRecommendation({
                title: 'Forecast Error',
                message: data.message || 'Could not generate forecast.'
            });
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while generating forecast');
    });
});
    
    // Handle get adjustment button
    getAdjustmentBtn.addEventListener('click', function() {
        fetch('/get_budget_adjustment')
        .then(response => response.json())
        .then(data => {
            const content = `
                <div class="adjustment-suggestion">
                    <h3><i class="fas fa-adjust"></i> Budget Adjustment Suggestion</h3>
                    <p>The AI suggests you <strong>${data.action}</strong> your budget for <strong>${data.category}</strong>.</p>
                    <p>Current budget: $${data.current_budget.toFixed(2)}</p>
                    <p>Suggested budget: $${data.suggested_budget.toFixed(2)}</p>
                    <p>This recommendation is based on your spending patterns and budget utilization.</p>
                </div>
            `;
            
            document.getElementById('adjustmentContent').innerHTML = content;
            adjustmentModal.style.display = 'block';
            
            // Store the current suggestion for accept/reject
            currentSuggestion = data;
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while getting budget adjustment');
        });
    });
    
    // Handle accept adjustment
    acceptAdjustment.addEventListener('click', function() {
        if (!currentSuggestion) return;
        
        fetch('/apply_budget_adjustment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                category: currentSuggestion.category,
                action: currentSuggestion.action
            })
        })
        .then(response => response.json())
        .then(data => {
            adjustmentModal.style.display = 'none';
            addRecommendation({
                title: 'Budget Adjusted',
                message: `Your ${currentSuggestion.category} budget has been updated to $${data.new_budget.toFixed(2)}.`
            });
            // Reload the page to show updated data
            setTimeout(() => location.reload(), 1500);
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while applying adjustment');
        });
    });
    
    // Handle reject adjustment
    rejectAdjustment.addEventListener('click', function() {
        adjustmentModal.style.display = 'none';
        addRecommendation({
            title: 'Suggestion Rejected',
            message: `You chose to keep your ${currentSuggestion.category} budget at $${currentSuggestion.current_budget.toFixed(2)}.`
        });
    });
    
    // Helper function to add recommendations
    function addRecommendation({title, message, isHTML = false}) {
        const recommendation = document.createElement('div');
        recommendation.className = 'recommendation';
        
        if (isHTML) {
            recommendation.innerHTML = `
                <h3>${title}</h3>
                ${message}
            `;
        } else {
            recommendation.innerHTML = `
                <h3>${title}</h3>
                <p>${message}</p>
            `;
        }
        
        recommendationsContainer.insertBefore(recommendation, recommendationsContainer.firstChild);
        
        // Remove empty state if it exists
        const emptyState = document.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
    }
    
    // Store current suggestion for budget adjustment
    let currentSuggestion = null;
});
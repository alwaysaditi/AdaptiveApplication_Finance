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
    const charityBtn = document.getElementById('charityBtn');
    const charityModal = document.getElementById('charityModal');
    const charityForm = document.getElementById('charityForm');
    const reallocateCheckbox = document.getElementById('reallocateCheckbox');
    const reallocationGroup = document.getElementById('reallocationGroup');
        
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

// Add this event listener for the charity button
charityBtn.addEventListener('click', function() {
    charityModal.style.display = 'block';
    
    // Get charity suggestion
    fetch('/get_charity_suggestion')
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            document.getElementById('charitySuggestion').innerHTML = `
                <div class="charity-suggestion">
                    <p><strong>AI Suggestion:</strong> Donate $${data.suggested_amount.toFixed(2)}</p>
                    <p>${data.message}</p>
                    <p>We suggest reallocating from your <strong>${data.suggested_reallocation}</strong> budget</p>
                    <button id="useSuggestion" class="btn-secondary">Use This Suggestion</button>
                </div>
            `;
            
            document.getElementById('useSuggestion').addEventListener('click', function() {
                document.getElementById('charityAmount').value = data.suggested_amount.toFixed(2);
                document.getElementById('reallocationCategory').value = data.suggested_reallocation;
                document.getElementById('reallocateCheckbox').checked = true;
                reallocationGroup.style.display = 'block';
            });
        } else {
            document.getElementById('charitySuggestion').innerHTML = `
                <p class="empty-state">${data.message || 'Could not generate suggestion'}</p>
            `;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        document.getElementById('charitySuggestion').innerHTML = `
            <p class="empty-state">Error getting suggestion</p>
        `;
    });
});

// Toggle reallocation field
reallocateCheckbox.addEventListener('change', function() {
    reallocationGroup.style.display = this.checked ? 'block' : 'none';
});


// Handle charity form submission

charityForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const amount = parseFloat(document.getElementById('charityAmount').value);
    const category = document.getElementById('charityCategory').value;
    const reallocate = reallocateCheckbox.checked;
    const reallocationCategory = reallocate ? document.getElementById('reallocationCategory').value : null;

    try {
        const response = await fetch('/process_charity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amount,
                category: category,
                reallocation_category: reallocationCategory
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to process donation');
        }

        // THIS IS WHERE THE UPDATE GOES ↓
        if (data.status === 'success') {
            charityModal.style.display = 'none';
            
            // Update the budgets
            if (data.updated_budgets) {
                Object.assign(user_data.budgets, data.updated_budgets);
                updateBudgetDisplays(data.updated_budgets);
            }
            
            // Add the new transaction to the UI
            if (data.new_transaction) {
                addTransactionToUI(data.new_transaction);
            }
            
            addRecommendation({
                title: 'Donation Processed',
                message: `Thank you for donating $${amount.toFixed(2)} to ${category}!` + 
                    (reallocate ? ` Amount reallocated from ${reallocationCategory} budget.` : '')
            });
        } else {
            showError(data.message || 'Error processing donation');
        }
    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'An error occurred while processing donation');
    }
});
// charityForm.addEventListener('submit', async function(e) {
//     e.preventDefault();
    
//     const amount = parseFloat(document.getElementById('charityAmount').value);
//     const category = document.getElementById('charityCategory').value;
//     const reallocate = reallocateCheckbox.checked;
//     const reallocationCategory = reallocate ? document.getElementById('reallocationCategory').value : null;

//     try {
//         const response = await fetch('/process_charity', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({
//                 amount: amount,
//                 category: category,
//                 reallocation_category: reallocationCategory
//             })
//         });

//         const data = await response.json();
        
//         if (!response.ok) {
//             throw new Error(data.message || 'Failed to process donation');
//         }

//         if (data.status === 'success') {
//             charityModal.style.display = 'none';
//             addRecommendation({
//                 title: 'Donation Processed',
//                 message: `Thank you for donating $${amount.toFixed(2)} to ${category}!` + 
//                     (reallocate ? ` Amount reallocated from ${reallocationCategory} budget.` : '')
//             });
//             setTimeout(() => location.reload(), 1500);
//         } else {
//             showError(data.message || 'Error processing donation');
//         }
//     } catch (error) {
//         console.error('Error:', error);
//         showError(error.message || 'An error occurred while processing donation');
//     }
// });

// Helper function to show errors
function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    
    // Remove any existing error messages
    const existingErrors = document.querySelectorAll('.error-message');
    existingErrors.forEach(err => err.remove());
    
    // Insert the error message above the form
    charityForm.insertBefore(errorElement, charityForm.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => errorElement.remove(), 5000);
}

// Handle charity form submission
// charityForm.addEventListener('submit', function(e) {
//     e.preventDefault();
    
//     const amount = parseFloat(document.getElementById('charityAmount').value);
//     const category = document.getElementById('charityCategory').value;
//     const reallocate = reallocateCheckbox.checked;
//     const reallocationCategory = reallocate ? document.getElementById('reallocationCategory').value : null;
    
//     fetch('/process_charity', {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//             amount: amount,
//             category: category,
//             reallocation_category: reallocationCategory
//         })
//     })
//     .then(response => response.json())
//     .then(data => {
//         if (data.status === 'success') {
//             charityModal.style.display = 'none';
//             addRecommendation({
//                 title: 'Donation Processed',
//                 message: `Thank you for donating $${amount.toFixed(2)} to ${category}!` + 
//                     (reallocate ? ` Amount reallocated from ${reallocationCategory} budget.` : '')
//             });
//             setTimeout(() => location.reload(), 1500);
//         } else {
//             alert(data.message || 'Error processing donation');
//         }
//     })
//     .catch(error => {
//         console.error('Error:', error);
//         alert('An error occurred while processing donation');
//     });
// });

function updateBudgetDisplays(updatedBudgets) {
    // Update all budget cards
    document.querySelectorAll('.budget-card').forEach(card => {
        const category = card.querySelector('h3').textContent;
        if (updatedBudgets[category] !== undefined) {
            const remaining = updatedBudgets[category];
            const initial = initial_budgets[category];
            
            // Update the progress bar
            const progressBar = card.querySelector('.progress-bar');
            const percentage = Math.min(100, (remaining / initial) * 100);
            progressBar.style.width = `${percentage}%`;
            progressBar.style.backgroundColor = getProgressColor(percentage);
            
            // Update the text display
            card.querySelector('p').textContent = 
                `$${remaining.toFixed(2)} remaining of $${initial.toFixed(2)}`;
        }
    });
}

function addTransactionToUI(transaction) {
    const tbody = document.querySelector('.recent-transactions tbody');
    
    // Create new row
    const row = document.createElement('tr');
    
    // Add charity class if applicable
    if (transaction.category === 'Charity') {
        row.classList.add('charity-transaction');
    }
    
    // Format amount with proper class
    const amountClass = transaction.amount > 0 ? 'expense' : 'income';
    const amountDisplay = `$${Math.abs(transaction.amount).toFixed(2)}`;
    
    // Build row HTML
    row.innerHTML = `
        <td>${transaction.date}</td>
        <td>
            ${transaction.description}
            ${transaction.category === 'Charity' ? 
              `<br><small>(${transaction.charity_category})</small>` : ''}
        </td>
        <td class="${amountClass}">${amountDisplay}</td>
        <td>${transaction.category}</td>
    `;
    
    // Add to top of table
    tbody.insertBefore(row, tbody.firstChild);
    
    // Keep only the last 5 transactions
    if (tbody.children.length > 5) {
        tbody.removeChild(tbody.lastChild);
    }
}

function getProgressColor(percentage) {
    if (percentage < 30) return 'var(--danger)';
    if (percentage < 70) return 'var(--warning)';
    return 'var(--success)';
}

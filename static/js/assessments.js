document.addEventListener('DOMContentLoaded', function() {
    // Assessment questions
    const gad7Questions = [
        "Feeling nervous, anxious, or on edge",
        "Not being able to stop or control worrying",
        "Worrying too much about different things",
        "Trouble relaxing",
        "Being so restless that it's hard to sit still",
        "Becoming easily annoyed or irritable",
        "Feeling afraid as if something awful might happen"
    ];

    const phq9Questions = [
        "Little interest or pleasure in doing things",
        "Feeling down, depressed, or hopeless",
        "Trouble falling/staying asleep, sleeping too much",
        "Feeling tired or having little energy",
        "Poor appetite or overeating",
        "Feeling bad about yourself/feeling like a failure",
        "Trouble concentrating on things",
        "Moving or speaking slowly/being fidgety or restless",
        "Thoughts of being better off dead or self-harm"
    ];

    // Populate assessment forms
    function createQuestionElement(question, index, formType) {
        return `
            <div class="mb-3">
                <label class="form-label">${index + 1}. ${question}</label>
                <select class="form-select" id="${formType}_${index}" required>
                    <option value="0">Not at all</option>
                    <option value="1">Several days</option>
                    <option value="2">More than half the days</option>
                    <option value="3">Nearly every day</option>
                </select>
            </div>
        `;
    }

    const gad7Container = document.getElementById('gad7Questions');
    const phq9Container = document.getElementById('phq9Questions');

    if (gad7Container) {
        gad7Container.innerHTML = gad7Questions
            .map((q, i) => createQuestionElement(q, i, 'gad7'))
            .join('');
    }

    if (phq9Container) {
        phq9Container.innerHTML = phq9Questions
            .map((q, i) => createQuestionElement(q, i, 'phq9'))
            .join('');
    }

    // Form submission handlers
    function handleFormSubmit(formId, assessmentType, questions) {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            if (assessmentType === 'sleep') {
                const sleepData = {
                    assessmentType: 'sleep',
                    hours: parseInt(document.getElementById('sleepHours').value),
                    latency: parseInt(document.getElementById('sleepLatency').value),
                    disruption: parseInt(document.getElementById('sleepDisruption').value)
                };
                
                // Store data in sessionStorage and redirect
                sessionStorage.setItem('assessmentData', JSON.stringify(sleepData));
                window.location.href = '/chat';
            } else {
                let totalScore = 0;
                const responses = [];

                for (let i = 0; i < questions.length; i++) {
                    const score = parseInt(document.getElementById(`${assessmentType}_${i}`).value);
                    totalScore += score;
                    responses.push(score);
                }
                
                const assessmentData = {
                    assessmentType: assessmentType,
                    assessmentScore: totalScore,
                    responses: responses
                };

                // Store data in sessionStorage and redirect
                sessionStorage.setItem('assessmentData', JSON.stringify(assessmentData));
                window.location.href = '/chat';
            }
        });
    }

    // Initialize form handlers
    handleFormSubmit('gad7Form', 'gad7', gad7Questions);
    handleFormSubmit('phq9Form', 'phq9', phq9Questions);
    handleFormSubmit('sleepForm', 'sleep');
});
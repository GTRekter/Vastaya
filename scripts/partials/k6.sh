function k6.start {
    k6 run ./k6/get-projects.js
    k6 run ./k6/get-project-report.js
}
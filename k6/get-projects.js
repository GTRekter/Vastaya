import http from 'k6/http';
import { sleep, check } from 'k6';
export let options = {
    vus: 10000,           // Number of virtual users
    iterations: 10000, // Replace __N__ with the number of requests you want to make
};
const expectedResponse = [
    {
        "id": 1,
        "name": "Mock Task",
        "description": "This is a mock task for demonstration purposes",
        "projectId": 1,
        "status": "open"
    }
];
export default function () {
    let res = http.get('http://projects.vastaya.tech');
  
    let bodiesAreEqual = res.body === JSON.stringify(expectedResponse);
  
    check(res, {
      'Status code is 200': (r) => r.status === 200,
      'Response matches expected JSON': () => bodiesAreEqual,
    });
}
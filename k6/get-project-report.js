import http from 'k6/http';
import { sleep, check } from 'k6';
export let options = {
    vus: 10000,           // Number of virtual users
    iterations: 10000, // Replace __N__ with the number of requests you want to make
};
export default function () {
    let res = http.get('http://projects.vastaya.tech/1/report');

    check(res, {
      'Status code is 200': (r) => r.status === 200
    });
}
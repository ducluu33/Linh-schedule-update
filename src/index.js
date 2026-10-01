const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const ics = require('ics');

const GROUP_ID = '15.27д-би01/25б';
const MAX_WEEKS = 20;
const DELAY_MS = 500;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSchedule() {
  const events = [];

  for (let weekNum = 1; weekNum <= MAX_WEEKS; weekNum++) {
    console.log(`Fetching week ${weekNum}...`);
    try {
      const url = `https://rasp.rea.ru/Schedule/ScheduleCard?selection=${encodeURIComponent(GROUP_ID)}&weekNum=${weekNum}&catfilter=0`;
      const response = await fetch(url, {
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch week ${weekNum}: ${response.status} ${response.statusText}`);
        continue;
      }

      const html = await response.text();
      console.log(`Fetched week ${weekNum}: length ${html.length}`);
      const $ = cheerio.load(html);

      $('table.table').each((i, table) => {
        const theadText = $(table).find('thead .dayh h5').text();
        const dateMatch = theadText.match(/\d{2}\.\d{2}\.\d{4}/);
        
        if (!dateMatch) return;
        const [day, month, year] = dateMatch[0].split('.').map(Number);
        
        $(table).find('tr.slot').each((j, tr) => {
          const $tr = $(tr);
          const trText = $tr.text();
          
          if (trText.includes('Занятия отсутствуют') || $tr.hasClass('load-empty')) {
            return;
          }

          const firstTd = $tr.find('td').eq(0).html();
          if (!firstTd) return;
          
          const timeParts = firstTd.split(/<br\s*\/?>/i);
          if (timeParts.length < 3) return;
          
          const startTimeStr = cheerio.load(timeParts[1]).text().trim();
          const endTimeStr = cheerio.load(timeParts[2]).text().trim();
          
          const [startHour, startMin] = startTimeStr.split(':').map(Number);
          const [endHour, endMin] = endTimeStr.split(':').map(Number);
          
          if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
            console.log("NaN time:", startTimeStr, endTimeStr);
            return;
          }

          const secondTd = $tr.find('td').eq(1);
          let targetHtml = secondTd.find('a.task').html();
          if (!targetHtml) {
             targetHtml = secondTd.html();
          }
          if (!targetHtml) {
             console.log("No targetHtml for:", secondTd.html());
             return;
          }

          const infoParts = targetHtml.split(/<br\s*\/?>/i);
          const subject = infoParts[0] ? cheerio.load(infoParts[0]).text().trim() : '';
          
          let type = '';
          let room = '';
          
          if (infoParts[1]) {
             const $part1 = cheerio.load(infoParts[1]);
             type = $part1('i').text().trim();
             room = $part1.text().replace(type, '').trim();
             if(!room && infoParts[2]) {
                 room = cheerio.load(infoParts[2]).text().trim().replace(/\s+/g, ' ');
             }
          }
          
          if (subject) {
             // Convert Moscow time (UTC+3) to UTC
             const startDate = new Date(Date.UTC(year, month - 1, day, startHour - 3, startMin));
             const endDate = new Date(Date.UTC(year, month - 1, day, endHour - 3, endMin));
             
             events.push({
               start: [startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate(), startDate.getUTCHours(), startDate.getUTCMinutes()],
               end: [endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate(), endDate.getUTCHours(), endDate.getUTCMinutes()],
               startInputType: 'utc',
               startOutputType: 'utc',
               title: subject + (type ? ` (${type})` : ''),
               location: room,
               description: type || subject
             });
          }
        });
      });
      
    } catch (err) {
      console.error(`Error fetching week ${weekNum}:`, err.message);
    }
    
    await sleep(DELAY_MS);
  }

  if (events.length > 0) {
    console.log("Events:", events.length); console.log(`Generating ICS for ${events.length} events...`);
    const { error, value } = ics.createEvents(events);
    
    if (error) {
      console.error("Error creating ICS file:", error);
      return;
    }
    
    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(publicDir, 'schedule.ics'), value);
    console.log("ICS file saved to public/schedule.ics");
  } else {
    console.log("No events found.");
  }
}

fetchSchedule();

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const ics = require('ics');

const GROUP_ID = '15.23д-мум01/26м';
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
          "x-requested-with": "XMLHttpRequest"
        }
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch week ${weekNum}: ${response.status} ${response.statusText}`);
        continue;
      }

      const html = await response.text();
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
          if (timeParts.length < 2) return;
          
          const startTimeStr = cheerio.load(timeParts[0]).text().trim();
          const endTimeStr = cheerio.load(timeParts[1]).text().trim();
          
          const [startHour, startMin] = startTimeStr.split(':').map(Number);
          const [endHour, endMin] = endTimeStr.split(':').map(Number);
          
          if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) return;

          const secondTd = $tr.find('td').eq(1);
          let targetHtml = secondTd.find('a.task').html();
          if (!targetHtml) {
             targetHtml = secondTd.html();
          }
          if (!targetHtml) return;

          const infoParts = targetHtml.split(/<br\s*\/?>/i);
          const subject = infoParts[0] ? cheerio.load(infoParts[0]).text().trim() : '';
          
          let type = '';
          let room = '';
          
          if (infoParts[1]) {
             const $part1 = cheerio.load(infoParts[1]);
             type = $part1('i').text().trim();
             room = $part1.text().replace(type, '').trim();
             if(!room && infoParts[2]) {
                 room = cheerio.load(infoParts[2]).text().trim();
             }
          }
          
          if (subject) {
             events.push({
               start: [year, month, day, startHour, startMin],
               end: [year, month, day, endHour, endMin],
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
    console.log(`Generating ICS for ${events.length} events...`);
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

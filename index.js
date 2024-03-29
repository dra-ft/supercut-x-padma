/*  
    supercuts with pad.ma

    -> this is a dra.ft (probably gonna call all my WIPs as dra.fts from now on) 
    -> searches the pad.ma archive by transcripts 
    -> returns set of videos or a single merged video, in other words, a supercut
    -> for now, the length of each cut is quite big compared to a conventional supercut 

    -> required parameters 
    -> SEARCH_TERM : the keyword to search by
    
    -> optional parameters
    -> RANGE : upper limit for number of videos to be processed
    -> DURATION_LIMIT : upper limit for length of each cut
    -> FOLDER_NAME : name of folder to save output
    -> FILE_NAME : name of output file

 */


const rp = require('request-promise');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { exit } = require('process');

const ora = require('ora');
const argv = require('minimist')(process.argv.slice(2));
const url = "https://pad.ma/api";
const media_url = "https://media.v2.pad.ma";
const SEARCH_TERM = argv._[0];
const RANGE = argv.n ?? 10;
const DURATION_LIMIT = argv.c;
const OUTPUT_FOLDER = 'outputs';
const FOLDER_NAME = argv.dir ?? `${SEARCH_TERM.replace(/\s+/g, "_")}-${Date.now()}`;
const FILE_NAME = argv.o ?? SEARCH_TERM.replace(/\s+/g, "_");

var postData = {
  keys: ['title', 'id', 'date'],
  query: {
    conditions: [
      { key: 'transcripts', operator: '=', value: SEARCH_TERM },
    ],
    operator: '&',
  },
  range: [0, RANGE],
  sort: [
    { key: 'title', operator: '+' },
  ],
  // group: 'source',
};
JSON.stringify(postData)

const options = {
  method: 'POST',
  uri: url,
  body: {
    action: 'find',
    data: postData
  },
  json: true
};

const getVideoPartElement = (item, video_url) => {
  let condition = DURATION_LIMIT ? item.value.includes(SEARCH_TERM) && item.duration < DURATION_LIMIT : item.value.includes(SEARCH_TERM);
  if (condition) {
    let seekIn = item.in;
    let duration = item.duration;

    return new Promise((resolve, reject) => {
      var file_name = `./${OUTPUT_FOLDER}/${FOLDER_NAME}/${seekIn.toString().replace(".", "")}.webm`;
      var video_part = ffmpeg()
        .input(video_url)
        .inputFormat('webm')
        .seekInput(seekIn)
        .duration(duration)
        .size('640x480')
        .autopad('black')
        .on("start", commandLine => {
          throbber.text = `Processing video: ${item.id}`;
        })
        .on('error', function (err) {
          console.log('An error occurred: ' + err.message);
          reject(err);
        })
        .on('end', function () {
          resolve(file_name);
        })
        .save(file_name)
    });
  }
}


const getVideoElement = (id, data) => {
  // let video_url = `${media_url}/${id}/240p1.webm?${data.streams[0]}`;
  let video_url = `${media_url}/${id}/240p1.webm?${data.modified}`;
  const videos = data.layers.transcripts.map(item => getVideoPartElement(item, video_url));
  return Promise.all(videos);
}

const getItem = (item) => {
  const getItemPostData = {
    id: item.id,
    keys: ['title', 'layers', 'streams', 'modified']
  }
  JSON.stringify(getItemPostData);

  const getItemRequest = {
    method: 'POST',
    uri: url,
    body: {
      action: 'get',
      data: getItemPostData
    },
    json: true
  }

  return rp(getItemRequest)
    .then(result => getVideoElement(item.id, result.data))
    .catch(err => console.log(err))
}

let throbber = ora('supercut-x-padma').start();
throbber.spinner = 'growVertical';
if (!fs.existsSync(`./${OUTPUT_FOLDER}/${FOLDER_NAME}`)) {
  fs.mkdirSync(`./${OUTPUT_FOLDER}/${FOLDER_NAME}`, { recursive: true });
}
rp(options)
  .then(result => {
    if (result.data.items.length == 0) {
      console.log("sorry..pad.ma doesn't have anything for your search term at the moment");
      exit(0);
    }
    throbber.text = 'getting files from pad.ma';
    const getItems = result.data.items.map((item) => getItem(item));
    return Promise.all(getItems);
  })
  .then(() => {
    let output_folder = `./${OUTPUT_FOLDER}/${FOLDER_NAME}`;
    let output_file = `${output_folder}/${FILE_NAME}@padmaSupercut.webm`;
    
    throbber.text = `them files are now in : ${output_folder}`;
    throbber.text = 'merging videos together..';
    let files = fs.readdirSync(`${output_folder}`);

    if(files.length == 0) {
      throbber.stopAndPersist({
        symbol: '✂️',
        text: `sorry, we could not make a supercut!`
      });
      exit(0);
    }
    const final = ffmpeg();
    const probes = files.map(file =>  {
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(`${output_folder}/` + file, (err, metadata) => {
          if(metadata.streams.length < 2) resolve(null)
          else resolve(`${output_folder}/` + file)
        })
      })
    })
    Promise.all(probes).then(files => {
      files.forEach(file => {
        if(file != null) {
          final.mergeAdd(file)
        } 
      })
      final.mergeToFile(`${output_file}`, './');
    });

    // final.on('codecData', function(data) {
    //   console.log('Input is ' + data.audio + ' audio ' +
    //     'with ' + data.video + ' video');
    // });
    final.on('error', function (err) {
      console.log('An error occurred: ' + err);
      throbber.stop();
    })
    final.on('end', function () {
      throbber.stopAndPersist({
        symbol: '✂️',
        text: `we made a (rough)supercut, wohoo! : ${output_file}`
      });
    })
    

  })
  .catch(err => console.log(err));
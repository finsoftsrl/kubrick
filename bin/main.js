#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const chalk = require('chalk');
const inquirer = require('inquirer');
const inquirerFileTreeSelection = require('inquirer-file-tree-selection-prompt');
const { Readable } = require('stream');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelection);

let current_target = null;
let last_output = null;

const argv = yargs(hideBin(process.argv))
	.option('system', { alias: 's', type: 'boolean', description: 'use ffmpeg from system', default: false })
	.argv;

const p = argv._.length > 0 ? path.resolve(argv._[0]) : process.cwd();
if(!fs.existsSync(p)){
	console.log('File not found!');
	process.exit(-1);
}
const DIR_MODE = fs.statSync(p).isDirectory();

const FFMPEG = argv.s ? 'ffmpeg' : path.join(__dirname, 'ffmpeg.exe');
const FFPROBE = argv.s ? 'ffprobe' : path.join(__dirname, 'ffprobe.exe');
const FFPLAY = argv.s ? 'ffprobe' : path.join(__dirname, 'ffplay.exe');

const info = (target) => {
	try{ child_process.execSync(`"${FFPROBE}" "${target}"`, { stdio: 'inherit' }); }catch(e){}
};

const convertTo = (target, ext) => {
	const filename = path.basename(target);
	const fout = `${filename.slice(0, filename.lastIndexOf('.'))}.${ext}`;
	last_output = path.join(process.cwd(), fout);
	try{ child_process.execSync(`"${FFMPEG}" -i "${target}" "${last_output}"`, { stdio: 'inherit' }); }catch(e){}
};

const noAudio = (target) => {
	const filename = path.basename(target);
	const lastI = filename.lastIndexOf('.');
	const fout = `${filename.slice(0, lastI)}.noAudio${filename.slice(lastI)}`;
	last_output = path.join(process.cwd(), fout);
	try{ child_process.execSync(`"${FFMPEG}" -i "${target}" -an "${last_output}"`, { stdio: 'inherit' }); }catch(e){}
};

const noData = (target) => {
	const filename = path.basename(target);
	const lastI = filename.lastIndexOf('.');
	const fout = `${filename.slice(0, lastI)}.noMetadata${filename.slice(lastI)}`;
	last_output = path.join(process.cwd(), fout);
	try{ child_process.execSync(`"${FFMPEG}" -i "${target}" -map_metadata -1 "${last_output}"`, { stdio: 'inherit' }); }catch(e){}
};

const resizeToW = (target, size) => {
	const filename = path.basename(target);
	const lastI = filename.lastIndexOf('.');
	const fout = `${filename.slice(0, lastI)}.w${size}${filename.slice(lastI)}`;
	last_output = path.join(process.cwd(), fout);
	try{ child_process.execSync(`"${FFMPEG}" -i "${target}" -vf scale=${size}:-1 "${last_output}"`, { stdio: 'inherit' }); }catch(e){}
};

const resizeToH = (target, size) => {
	const filename = path.basename(target);
	const lastI = filename.lastIndexOf('.');
	const fout = `${filename.slice(0, lastI)}.h${size}${filename.slice(lastI)}`;
	last_output = path.join(process.cwd(), fout);
	try{ child_process.execSync(`"${FFMPEG}" -i "${target}" -vf scale=-1:${size} "${last_output}"`, { stdio: 'inherit' }); }catch(e){}
};

const shrinkVideo = (target, scale, crf, encoder = 'libx264') => {
	const filename = path.basename(target);
	const lastI = filename.lastIndexOf('.');
	const fout = `${filename.slice(0, lastI)}.sc${Math.floor((100/scale)*2)}.${crf}.${encoder}.mp4`;
	last_output = path.join(process.cwd(), fout);
	try{ child_process.execSync(`"${FFMPEG}" -i "${target}" -vf "scale=trunc(iw/${scale})*2:trunc(ih/${scale})*2" -c:v ${encoder} -crf ${crf} "${last_output}"`, { stdio: 'inherit' }); }catch(e){}
}

const pickTarget = (root) => new Promise((resolve, reject) => {
	console.clear();
	inquirer.prompt([{
		type: 'file-tree-selection',
		name: 'v',
		enableGoUpperDirectory: true,
		message: `Choose file`,
		root,
		transformer: (input) => {
			const name = input.split(path.sep).pop();
			if (name[0] == ".") return chalk.grey(name);
			return name;
		}
	}]).then(async res => {
		if(fs.statSync(res.v).isDirectory()){
			let v = await pickTarget(res.v);
			resolve(v)
		}else{
			resolve(res.v);
		}
	}).catch(reject);
});

const askContinue = () => new Promise((resolve, reject) => {
	inquirer.prompt([{
		type: 'confirm',
		name: 'v',
		message: 'Do you want to continue',
		default: true
	}]).then(res => {
		if(res.v == false)
			process.exit(0);
		resolve();
	}).catch(reject);
});

const ask = (message, _default = true) => new Promise((resolve, reject) => {
	inquirer.prompt([{
		type: 'confirm',
		name: 'v',
		message,
		default: _default
	}]).then(res => {
		resolve(res.v);
	}).catch(reject);
});

const promptMenu = (menu, message) => new Promise((resolve, reject) => {
	console.clear();
	inquirer.prompt([{
		type: 'list',
		name: 'v',
		message,
		loop: false,
		choices: Object.keys(menu)
	}]).then(res => {
		resolve(menu[res.v]);
	}).catch(reject);
});

const mainSelect = {
	'Convert': (target) => promptMenu(convertSelect, `Convert ${target}`),
	'Resize image width': (target) => promptMenu(resizeWSelect, `Resize width ${target}`),
	'Resize image height': (target) => promptMenu(resizeHSelect, `Resize height ${target}`),
	'Shrink video': (target) => promptMenu(shrinkSelect, `Shrink ${target}`),
	'Remove data': (target) => promptMenu(removeSelect, `Remove data ${target}`),
	'File info': 'info',
	'Exit': () => process.exit(0)
};

const convertSelect = {
	'Convert to JPG': (target) => convertTo(target, 'jpg'),
	'Convert to PNG': (target) => convertTo(target, 'png'),
	'Convert to MP4': (target) => convertTo(target, 'mp4'),
	'Back': false
};

const resizeWSelect = {
	'Resize img (192 width)': (target) => resizeToW(target, 192),
	'Resize img (576 width)': (target) => resizeToW(target, 576),
	'Resize img (768 width)': (target) => resizeToW(target, 768),
	'Resize img (992 width)': (target) => resizeToW(target, 992),
	'Resize img (1200 width)': (target) => resizeToW(target, 1200),
	'Resize img (1400 width)': (target) => resizeToW(target, 1400),
	'Resize img (custom width)': async (target) => {
		console.clear();
		let res = await inquirer.prompt([{
			type: 'number',
			name: 'v',
			message: 'Choose width'
		}]);
		resizeToW(target, parseInt(res.v));
	},
	'Back': false
};

const resizeHSelect = {
	'Resize img (192 height)': (target) => resizeToH(target, 192),
	'Resize img (576 height': (target) => resizeToH(target, 576),
	'Resize img (768 height)': (target) => resizeToH(target, 768),
	'Resize img (992 height)': (target) => resizeToH(target, 992),
	'Resize img (1200 height)': (target) => resizeToH(target, 1200),
	'Resize img (1400 height)': (target) => resizeToH(target, 1400),
	'Resize img (custom height)': async (target) => {
		console.clear();
		let res = await inquirer.prompt([{
			type: 'number',
			name: 'v',
			message: 'Choose height'
		}]);
		resizeToH(target, parseInt(res.v));
	},
	'Back': false
};

const shrinkSelect = {
	'scale 25% libx264 no loss (Firefox compatible)': (target) => shrinkVideo(target, 8, 18, 'libx264'),
	'scale 25% libx264 default loss (Firefox compatible)': (target) => shrinkVideo(target, 8, 23, 'libx264'),
	'scale 25% libx264 loss (Firefox compatible)': (target) => shrinkVideo(target, 8, 28, 'libx264'),
	'scale 33% libx264 no loss (Firefox compatible)': (target) => shrinkVideo(target, 6, 18, 'libx264'),
	'scale 33% libx264 default loss (Firefox compatible)': (target) => shrinkVideo(target, 6, 23, 'libx264'),
	'scale 33% libx264 loss (Firefox compatible)': (target) => shrinkVideo(target, 6, 28, 'libx264'),
	'scale 50% libx264 no loss (Firefox compatible)': (target) => shrinkVideo(target, 4, 18, 'libx264'),
	'scale 50% libx264 default loss (Firefox compatible)': (target) => shrinkVideo(target, 4, 23, 'libx264'),
	'scale 50% libx264 loss (Firefox compatible)': (target) => shrinkVideo(target, 4, 28, 'libx264'),
	'scale 100% libx264 no loss (Firefox compatible)': (target) => shrinkVideo(target, 2, 18, 'libx264'),
	'scale 100% libx264 default loss (Firefox compatible)': (target) => shrinkVideo(target, 2, 23, 'libx264'),
	'scale 100% libx264 loss (Firefox compatible)': (target) => shrinkVideo(target, 2, 28, 'libx264'),
	'scale 25% libx265 no loss': (target) => shrinkVideo(target, 8, 18, 'libx265'),
	'scale 25% libx265 default loss': (target) => shrinkVideo(target, 8, 23, 'libx265'),
	'scale 25% libx265 loss': (target) => shrinkVideo(target, 8, 28, 'libx265'),
	'scale 33% libx265 no loss': (target) => shrinkVideo(target, 6, 18, 'libx265'),
	'scale 33% libx265 default loss': (target) => shrinkVideo(target, 6, 23, 'libx265'),
	'scale 33% libx265 loss': (target) => shrinkVideo(target, 6, 28, 'libx265'),
	'scale 50% libx265 no loss': (target) => shrinkVideo(target, 4, 18, 'libx265'),
	'scale 50% libx265 default loss': (target) => shrinkVideo(target, 4, 23, 'libx265'),
	'scale 50% libx265 loss': (target) => shrinkVideo(target, 4, 28, 'libx265'),
	'scale 100% libx265 no loss': (target) => shrinkVideo(target, 2, 18, 'libx265'),
	'scale 100% libx265 default loss': (target) => shrinkVideo(target, 2, 23, 'libx265'),
	'scale 100% libx265 loss': (target) => shrinkVideo(target, 2, 28, 'libx265'),
	'Back': false
};

const removeSelect = {
	'Remove audio': (target) => noAudio(target),
	'Remove metadata': (target) => noData(target),
	'Back': false
};

const downloadLocation = {
	ffmpeg: {
		name: FFMPEG,
		url: 'https://molto.cloud/ffmpeg/ffmpeg.exe'
	},
	ffprobe: {
		name: FFPROBE,
		url: 'https://molto.cloud/ffmpeg/ffprobe.exe'
	},
	ffplay: {
		name: FFPLAY,
		url: 'https://molto.cloud/ffmpeg/ffplay.exe'
	}
};

const download = (id) => new Promise((resolve, reject) => {
	console.log('Downloading ' + id);
	fetch(downloadLocation[id].url).then(res => {
		if (res.ok && res.body) {
			let fileStream = fs.createWriteStream(downloadLocation[id].name);
			Readable.fromWeb(res.body).pipe(fileStream);
			fileStream.on("finish", () => resolve() );
		}else{
			reject('invalid link');
		}
	}).catch(err => reject(err) );
});

(async ()=>{

	if(!argv.s){
		if(!fs.existsSync(FFMPEG)) await download('ffmpeg');
		if(!fs.existsSync(FFPROBE)) await download('ffprobe');
		if(!fs.existsSync(FFPLAY)) await download('ffplay');
	}

	current_target = DIR_MODE ? (await pickTarget(p)) : p;
	while(true){
		let f;
		//MAIN LOOP
		do{
			let secondMenu = await promptMenu(mainSelect, `Working on ${current_target}`);
			if(secondMenu == 'info'){
				info(current_target);
			}else{
				f = await secondMenu(current_target);
			}
		}while(f === false);
		//EXEC f()
		if(typeof f == 'function'){
			if(f instanceof (async () => {}).constructor){
				await f(current_target);
			}else{
				let r = f(current_target);
				if(r instanceof Promise) await r;
			}
		}
		//CONTINUE
		await askContinue();
		if(await ask('Continue with new file')){
			current_target = last_output;
		}else if(await ask('Choose new file')){
			current_target = DIR_MODE ? (await pickTarget(p)) : p;
		}
	}
})();

/**/
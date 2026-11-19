"""逐帧渲染 58 秒无声模型选择器操作视频。"""
import argparse
import base64
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

SCRIPT=Path(__file__).resolve()
ROOT=SCRIPT.parents[1]
DEFAULT_INPUT=ROOT/'index.html'
DEFAULT_OUTPUT=ROOT/'build'/'picker-58s-picture.mp4'
FPS=25
FRAMES=58*FPS
DPR=2.5
TEXT='给这个模型选择器做一次上线前的交互检查。'

class Recorder:
    def __init__(self,page,folder):
        self.page=page;self.folder=folder;self.index=0;self.time=0.0
        self.cdp=page.context.new_cdp_session(page)
        self.capture()
    def capture(self):
        if self.index>=FRAMES:return
        shot=self.cdp.send('Page.captureScreenshot',{'format':'jpeg','quality':94,
            'fromSurface':True,'captureBeyondViewport':False})
        (self.folder/f'frame-{self.index:05d}.jpg').write_bytes(base64.b64decode(shot['data']))
        self.index+=1
    def at(self,second):
        assert second>=self.time,(self.time,second)
        while self.index<FRAMES and self.index/FPS<=second+1e-9:
            target=self.index/FPS
            if target>self.time:self.page.clock.run_for(round((target-self.time)*1000));self.time=target
            self.capture()
        if second>self.time:self.page.clock.run_for(round((second-self.time)*1000));self.time=second
    def finish(self):
        while self.index<FRAMES:
            target=self.index/FPS
            self.page.clock.run_for(round((target-self.time)*1000));self.time=target;self.capture()
        if self.time<58:self.page.clock.run_for(round((58-self.time)*1000));self.time=58

def main(argv=None):
    parser=argparse.ArgumentParser(description='Render the 58-second fixed-editor picture.')
    parser.add_argument('--input',type=Path,default=DEFAULT_INPUT)
    parser.add_argument('--output',type=Path,default=DEFAULT_OUTPUT)
    parser.add_argument('--chrome-channel',default='chrome')
    args=parser.parse_args(argv)
    target=args.input.resolve();output=args.output.resolve()
    if not target.exists():raise FileNotFoundError(target)
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='picker-58s-') as temp, sync_playwright() as pw:
        folder=Path(temp)
        browser=pw.chromium.launch(channel=args.chrome_channel,headless=True)
        page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=DPR,
                              reduced_motion='no-preference')
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.clock.install(time='2026-11-20T00:00:00Z');page.clock.pause_at('2026-11-20T00:00:00Z')
        page.goto(target.as_uri())
        page.evaluate("""() => {const c=document.createElement('div');c.id='recording-cursor';
          c.innerHTML='<svg viewBox="0 0 24 30" width="22" height="28"><path d="M2 1 2.8 23 8.1 17.8 12.5 27 16.1 25.2 11.6 16.1 19 15.4Z" fill="white" stroke="#151515" stroke-width="1.35" stroke-linejoin="round"/></svg>';
          Object.assign(c.style,{position:'fixed',left:'640px',top:'650px',zIndex:'2147483647',pointerEvents:'none',filter:'drop-shadow(0 1px 1px #0005)'});document.body.append(c)}""")
        rec=Recorder(page,folder)

        cursor=[640.0,650.0]
        def move(x,y):
            cursor[0]=x;cursor[1]=y
            page.evaluate("([x,y])=>{const c=document.querySelector('#recording-cursor');c.style.left=x+'px';c.style.top=y+'px'}",[x,y])
            page.mouse.move(x,y)
        def glide(x,y,duration=.20):
            start=rec.time;sx,sy=cursor;steps=max(3,round(duration*FPS))
            for step in range(1,steps+1):
                rec.at(start+duration*step/steps)
                u=step/steps;u=u*u*(3-2*u);move(sx+(x-sx)*u,sy+(y-sy)*u)
        def click_loc(loc,duration=.20):
            box=loc.bounding_box();assert box
            glide(box['x']+box['width']/2,box['y']+box['height']/2,duration);page.mouse.down();page.mouse.up()
        def click(selector,duration=.20):
            loc=page.locator(selector);box=loc.bounding_box();assert box,selector
            click_loc(loc,duration)
        def family(index):click(f'[data-family="{index}"]')
        def select_effort(label):
            loc=page.locator('#effortList .effort-option:visible').filter(has_text=label)
            click_loc(loc,.18)
        wave_times=[]
        def dial_drag(delta,start,end,record_wave=False):
            box=page.locator('#dial').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
            if rec.time<start:glide(x,y,start-rec.time)
            else:move(x,y)
            page.mouse.down();steps=max(12,abs(delta)*6);first_ultra=None
            for step in range(1,steps+1):
                rec.at(start+(end-start)*step/steps);move(x,y-11*delta*step/steps)
                if record_wave and first_ultra is None and page.locator('#quickEffort').inner_text()=='Ultra':
                    first_ultra=rec.time;wave_times.append(first_ultra)
            page.mouse.up()
            return first_ultra

        # 0–3：草稿与 Astra 首次 Ultra。
        rec.at(.05);click('.input',.20);page.locator('.input').fill(TEXT)
        rec.at(.35);click('#modelTrigger',.22);rec.at(3.0)

        # 3–10：Terra Low → Ultra。
        family(0);rec.at(4.1);click('#dial',.20)
        rec.at(4.65);select_effort('Low');rec.at(5.8)
        dial_drag(5,6.0,8.6);rec.at(9.75)

        # 10–24：同一次长按，Terra 停 1.2s 后连续拖到 Bel。
        rail=page.locator('#familySlider');box=rail.bounding_box();y=box['y']+box['height']/2
        rx=lambda value:box['x']+17+(box['width']-34)*value/4
        def move_rail(a,b,start,end,steps=None):
            steps=steps or max(1,round((end-start)*FPS))
            for step in range(1,steps+1):
                rec.at(start+(end-start)*step/steps);move(rx(a+(b-a)*step/steps),y)
        rec.at(9.75);glide(rx(0),y,.25);page.mouse.down();rec.at(11.2)
        move_rail(0,1,11.2,13.2);rec.at(13.5);move_rail(1,2,13.5,15.9);rec.at(16.2)
        move_rail(2,3,16.2,18.6);rec.at(18.9);move_rail(3,4,18.9,22.0);rec.at(23.4)
        page.mouse.up();rec.at(24.0)

        # 24–27：退 Astra，再回 Bel。
        move(rx(4),y);page.mouse.down();move_rail(4,3,24.0,25.2);rec.at(25.5)
        move_rail(3,4,25.5,26.5);page.mouse.up();rec.at(27.0)

        # 27–31：Bel 6.2→6.1，Astra 往返检查记忆。
        click('#openFamilyVersions');rec.at(27.7)
        item=page.locator('#versionList .version-item:visible').filter(has_text='GPT-6.1 Bel')
        click_loc(item,.18);rec.at(28.5)
        family(3);rec.at(29.2);family(4);rec.at(30.75)

        # 31–43：Bel 灰/黄/紫三次激活，跨入 Ultra 后的首个成片帧为 32.24/36.64/40.64。
        dial_drag(-1,31.0,31.5);dial_drag(1,31.9,32.5,True);rec.at(35.0)
        click('#speedToggle');dial_drag(-1,35.4,35.9);dial_drag(1,36.3,36.9,True);rec.at(39.0)
        click('#speedToggle');dial_drag(-1,39.4,39.9);dial_drag(1,40.3,40.9,True);rec.at(43.0)

        # 43–50：回灰，Luna 与 Sol 分别触发流星。
        click('#speedToggle',.18);family(1);rec.at(43.4);click('#dial',.18);rec.at(43.7);select_effort('Max')
        rec.at(43.9);click('#dial',.18);rec.at(44.2);select_effort('Ultra');rec.at(45.35)
        family(2);rec.at(45.8);click('#dial',.18);rec.at(46.15);select_effort('Max')
        rec.at(46.4);click('#dial',.18);rec.at(46.75);select_effort('Ultra');rec.at(48.2);rec.at(50.0)

        # 50–55：目录返回、默认、还原。
        click('#openVersions',.20)
        rec.at(50.9);click('#backQuick');rec.at(51.5);click('#openVersions');rec.at(52.0)
        item=page.locator('#versionList .version-item:visible').filter(has_text='默认')
        click_loc(item,.18);rec.at(53.3)
        click('#restore');rec.at(55.0)

        # 55–58：Esc，保留草稿和发送箭头，不发送。
        page.keyboard.press('Escape');move(640,650);rec.at(58.0);rec.finish()
        assert rec.index==FRAMES and page.locator('.input').input_value()==TEXT
        assert page.locator('.primary-action').get_attribute('aria-label')=='发送'
        assert not errors,errors
        browser.close()

        vf="scale=1920:1080:flags=lanczos"
        subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-framerate',str(FPS),
            '-i',str(folder/'frame-%05d.jpg'),'-vf',vf,'-frames:v',str(FRAMES),
            '-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-r',str(FPS),
            '-an','-movflags','+faststart',str(output)],check=True)
    print(output)
    visible_waves=[(round(value*FPS)+1)/FPS for value in wave_times]
    print('frames',FRAMES,'fps',FPS,'duration',FRAMES/FPS,'waves',','.join(f'{v:.2f}' for v in visible_waves),'meteors','44.12,46.64')
    print('source',f'{int(1280*DPR)}x{int(720*DPR)}','fixed_full_editor','output','1920x1080')

if __name__=='__main__':
    main()

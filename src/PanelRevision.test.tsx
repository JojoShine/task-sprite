import { afterEach, it, expect, vi } from 'vitest';
import { render,screen,fireEvent,cleanup,waitFor } from '@testing-library/react';
import { TaskPanel } from './TaskPanel';
import { api } from './api';
import type { Snapshot } from './types';
vi.mock('./api',()=>({api:{execution:vi.fn(),appendStep:vi.fn(),panelInteraction:vi.fn(async()=>{}),syncStatus:vi.fn(async()=>({bound:false,enabled:false,pending:0,conflicts:[],license:null})),preview:vi.fn(),quit:vi.fn(),hide:vi.fn(),preferences:vi.fn()},message:String}));
afterEach(()=>{cleanup();vi.useRealTimers();});
const settings:Snapshot['settings']={pet:'robot',focusId:null,notifications:true,summaryTime:'09:00',quietStart:'23:00',quietEnd:'08:00',showHint:true,reduceMotion:false,theme:'system',petX:null,petY:null};
const tasks=Array.from({length:6},(_,i)=>({id:String(i),title:`任务${i}`,description:'',priority:i===0?'high' as const:'med' as const,status:'todo' as const,dueDate:null,dueTime:null,createdAt:'2026-11-01',updatedAt:'2026-11-01',completedAt:null}));
it('shows more than three tasks and moves companion selection into settings',()=>{
 render(<TaskPanel snapshot={{settings,tasks}} onSnapshot={()=>{}}/>);
 expect(screen.getAllByRole('button',{name:/^完成 /}).length).toBeGreaterThan(3);
 expect(screen.queryByRole('button',{name:'选择机器人'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'设置'}));
 expect(screen.getByRole('button',{name:'选择机器人'})).toBeTruthy();
});
it('filters parallel in-progress tasks and allows another task to start',async()=>{
 const snap:Snapshot={settings:{...settings,focusId:'0'},tasks,workflows:{'0':{state:'working',steps:[]},'1':{state:'waiting',steps:[]}}};
 vi.mocked(api.execution).mockResolvedValue(snap);
 render(<TaskPanel snapshot={snap} onSnapshot={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'开始做 任务2'}));
 await waitFor(()=>expect(api.execution).toHaveBeenCalledWith('2','working'));
 fireEvent.click(screen.getByRole('button',{name:'进行中 2'}));
 expect(screen.getByRole('button',{name:'任务0'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'任务1'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'任务2'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'等待结果 任务0'}));
 await waitFor(()=>expect(api.execution).toHaveBeenCalledWith('0','waiting'));
});
it('marks next calendar day orange, overdue red, and priority visibly',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,10,16,9));
 const {container}=render(<TaskPanel snapshot={{settings,tasks:[{...tasks[0],dueDate:'2026-11-17',dueTime:'17:00'},{...tasks[1],dueDate:'2026-11-15',dueTime:'17:00'}]}} onSnapshot={()=>{}}/>);
 expect(screen.getByRole('button',{name:'任务0'}).closest('.task-row')?.classList.contains('is-upcoming')).toBe(true);
 expect(screen.getByRole('button',{name:'任务1'}).closest('.task-row')?.classList.contains('is-overdue')).toBe(true);
 expect(container.querySelector('.priority-badge.priority-high')?.textContent).toContain('高');
 expect(screen.getByRole('button',{name:'设置'})).toBeTruthy();
});
it('shows full task body and a single settings entry in the header',()=>{
 const title='需要完整展示的任务标题'.repeat(6);
 const description=`${title}\n\n补充第一项详细说明\n补充第二项详细说明`;
 const {container}=render(<TaskPanel snapshot={{settings,tasks:[{...tasks[0],title,description}]}} onSnapshot={()=>{}}/>);
 expect(container.querySelector('.task-description')?.textContent).toBe('补充第一项详细说明\n补充第二项详细说明');
 expect(container.querySelector('.task-title')?.textContent).toBe(title);
 expect(screen.queryByRole('button',{name:'提醒设置'})).toBeNull();
 expect(screen.queryByRole('button',{name:'收起任务面板'})).toBeNull();
 expect(screen.getByRole('button',{name:'设置'})).toBeTruthy();
});

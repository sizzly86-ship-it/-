// ClipCheck - Ctrl+C 를 눌렀을 때 클립보드에 실제로 글자가 들어갔는지 화면에 표시하고,
// 안 들어갔으면 Ctrl+C 를 자동으로 다시 눌러 주는 프로그램.
// C# 5 문법만 사용 (Windows 기본 내장 csc.exe / PowerShell Add-Type 로 컴파일 가능).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Media;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ClipCheck
{
    public static class Program
    {
        [STAThread]
        public static void Main()
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, "ClipCheck_SingleInstance", out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show("ClipCheck 가 이미 실행 중입니다.\n작업 표시줄 오른쪽 아래 트레이 아이콘을 확인하세요.", "ClipCheck");
                    return;
                }
                Application.EnableVisualStyles();
                Application.Run(new App());
            }
        }
    }

    internal static class Native
    {
        public const int WH_KEYBOARD_LL = 13;
        public const int WM_KEYDOWN = 0x0100;
        public const int WM_SYSKEYDOWN = 0x0104;
        public const int WM_CLIPBOARDUPDATE = 0x031D;
        public const int VK_CONTROL = 0x11;
        public const int VK_MENU = 0x12;
        public const int VK_C = 0x43;
        public const int VK_X = 0x58;
        public const int VK_INSERT = 0x2D;
        public const uint CF_UNICODETEXT = 13;
        public const uint KEYEVENTF_KEYUP = 0x0002;

        // 이 프로그램이 직접 보낸 키 입력에 붙이는 표시 ("CLIP")
        public static readonly IntPtr OurInputMark = new IntPtr(0x434C4950);

        public const int WS_EX_TOPMOST = 0x00000008;
        public const int WS_EX_TRANSPARENT = 0x00000020;
        public const int WS_EX_TOOLWINDOW = 0x00000080;
        public const int WS_EX_NOACTIVATE = 0x08000000;

        public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        public static readonly IntPtr HWND_MESSAGE = new IntPtr(-3);
        public const uint SWP_NOSIZE = 0x0001;
        public const uint SWP_NOMOVE = 0x0002;
        public const uint SWP_NOACTIVATE = 0x0010;
        public const uint SWP_SHOWWINDOW = 0x0040;

        [StructLayout(LayoutKind.Sequential)]
        public struct KBDLLHOOKSTRUCT
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll")]
        public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
        public static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern uint MapVirtualKey(uint uCode, uint uMapType);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool AddClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll")]
        public static extern uint GetClipboardSequenceNumber();

        // 클립보드를 열지 않고 형식만 확인 (MES 쪽 복사를 방해하지 않음)
        [DllImport("user32.dll")]
        public static extern bool IsClipboardFormatAvailable(uint format);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        public static bool IsDown(int vk)
        {
            return (GetAsyncKeyState(vk) & 0x8000) != 0;
        }

        public static bool ClipboardHasText()
        {
            return IsClipboardFormatAvailable(CF_UNICODETEXT);
        }

        private static void Key(int vk, bool up)
        {
            byte scan = (byte)MapVirtualKey((uint)vk, 0);
            keybd_event((byte)vk, scan, up ? KEYEVENTF_KEYUP : 0, OurInputMark);
        }

        // Ctrl+C 를 대신 눌러 줌. 사용자가 Ctrl 을 누르고 있으면 C 만 보낸다.
        public static void SendCtrlC()
        {
            bool ctrlHeld = IsDown(VK_CONTROL);
            if (!ctrlHeld) Key(VK_CONTROL, false);
            Key(VK_C, false);
            Key(VK_C, true);
            if (!ctrlHeld) Key(VK_CONTROL, true);
        }
    }

    // 설정: %APPDATA%\ClipCheck\settings.ini 에 설정값만 저장 (복사 내용은 저장하지 않음)
    internal class Settings
    {
        public int RetryCount = 3;        // 자동 재시도 횟수 (0 = 끄기)
        public int WaitMs = 300;          // Ctrl+C 한 번마다 기다리는 시간
        public bool AtCursor = false;     // 알림 위치: false = 화면 우상단, true = 마우스 커서 옆
        public int OkShowMs = 1000;       // 성공 알림 표시 시간
        public int FailShowMs = 2000;     // 실패 알림 표시 시간
        public bool Preview = true;       // 복사 내용 미리보기
        public bool Sound = true;         // 실패 시 소리
        public bool ShowMouseCopy = true; // Ctrl+C 없이 복사돼도 표시

        private static string FilePath
        {
            get
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "ClipCheck", "settings.ini");
            }
        }

        public static Settings Load()
        {
            Settings s = new Settings();
            try
            {
                if (!File.Exists(FilePath)) return s;
                Dictionary<string, string> d = new Dictionary<string, string>();
                foreach (string line in File.ReadAllLines(FilePath, Encoding.UTF8))
                {
                    int eq = line.IndexOf('=');
                    if (eq > 0) d[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
                }
                s.RetryCount = GetInt(d, "RetryCount", s.RetryCount);
                s.WaitMs = GetInt(d, "WaitMs", s.WaitMs);
                s.AtCursor = GetInt(d, "AtCursor", s.AtCursor ? 1 : 0) != 0;
                s.OkShowMs = GetInt(d, "OkShowMs", s.OkShowMs);
                s.FailShowMs = GetInt(d, "FailShowMs", s.FailShowMs);
                s.Preview = GetInt(d, "Preview", s.Preview ? 1 : 0) != 0;
                s.Sound = GetInt(d, "Sound", s.Sound ? 1 : 0) != 0;
                s.ShowMouseCopy = GetInt(d, "ShowMouseCopy", s.ShowMouseCopy ? 1 : 0) != 0;
            }
            catch (Exception) { }
            return s;
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                File.WriteAllLines(FilePath, new string[] {
                    "RetryCount=" + RetryCount,
                    "WaitMs=" + WaitMs,
                    "AtCursor=" + (AtCursor ? 1 : 0),
                    "OkShowMs=" + OkShowMs,
                    "FailShowMs=" + FailShowMs,
                    "Preview=" + (Preview ? 1 : 0),
                    "Sound=" + (Sound ? 1 : 0),
                    "ShowMouseCopy=" + (ShowMouseCopy ? 1 : 0),
                }, Encoding.UTF8);
            }
            catch (Exception) { }
        }

        private static int GetInt(Dictionary<string, string> d, string key, int def)
        {
            string v;
            int n;
            return d.TryGetValue(key, out v) && int.TryParse(v, out n) ? n : def;
        }
    }

    // 윈도우 시작 시 자동 실행 (현재 사용자 레지스트리의 Run 항목)
    internal static class AutoStart
    {
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string Name = "ClipCheck";

        // exe 로 실행했을 때만 가능 (run.bat 으로 실행하면 exe 경로가 없음)
        public static bool Available
        {
            get { return Assembly.GetEntryAssembly() == typeof(Program).Assembly; }
        }

        private static string Command
        {
            get { return "\"" + Application.ExecutablePath + "\""; }
        }

        public static bool IsOn()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                    return k != null && k.GetValue(Name) != null;
            }
            catch (Exception) { return false; }
        }

        public static void Set(bool on)
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
                {
                    if (on) k.SetValue(Name, Command);
                    else if (k.GetValue(Name) != null) k.DeleteValue(Name);
                }
            }
            catch (Exception) { }
        }

        // exe 를 다른 폴더로 옮긴 경우 경로를 새로 고침
        public static void RefreshPath()
        {
            if (Available && IsOn()) Set(true);
        }
    }

    // 클립보드가 바뀔 때마다 알려주는 보이지 않는 창
    internal class ClipboardWatcher : NativeWindow, IDisposable
    {
        public event EventHandler ClipboardChanged;

        public ClipboardWatcher()
        {
            CreateParams cp = new CreateParams();
            cp.Parent = Native.HWND_MESSAGE;
            CreateHandle(cp);
            Native.AddClipboardFormatListener(Handle);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == Native.WM_CLIPBOARDUPDATE && ClipboardChanged != null)
                ClipboardChanged(this, EventArgs.Empty);
            base.WndProc(ref m);
        }

        public void Dispose()
        {
            if (Handle != IntPtr.Zero)
            {
                Native.RemoveClipboardFormatListener(Handle);
                DestroyHandle();
            }
        }
    }

    internal class CopyKeyEventArgs : EventArgs
    {
        public bool IsCut;
        public CopyKeyEventArgs(bool isCut) { IsCut = isCut; }
    }

    // 키보드 전역 후킹: Ctrl+C / Ctrl+X / Ctrl+Insert 감지
    internal class CopyKeyHook : IDisposable
    {
        public event EventHandler<CopyKeyEventArgs> CopyPressed;

        private readonly Native.LowLevelKeyboardProc proc; // GC 되지 않도록 필드로 보관
        private IntPtr hook = IntPtr.Zero;

        public CopyKeyHook()
        {
            proc = HookCallback;
            hook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, proc, Native.GetModuleHandle(null), 0);
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int msg = wParam.ToInt32();
                if (msg == Native.WM_KEYDOWN || msg == Native.WM_SYSKEYDOWN)
                {
                    Native.KBDLLHOOKSTRUCT k = (Native.KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.KBDLLHOOKSTRUCT));
                    int vk = (int)k.vkCode;
                    // 자동 재시도로 이 프로그램이 보낸 키는 무시
                    if (k.dwExtraInfo != Native.OurInputMark
                        && (vk == Native.VK_C || vk == Native.VK_X || vk == Native.VK_INSERT)
                        && Native.IsDown(Native.VK_CONTROL) && !Native.IsDown(Native.VK_MENU))
                    {
                        if (CopyPressed != null)
                            CopyPressed(this, new CopyKeyEventArgs(vk == Native.VK_X));
                    }
                }
            }
            return Native.CallNextHookEx(hook, nCode, wParam, lParam);
        }

        public void Dispose()
        {
            if (hook != IntPtr.Zero)
            {
                Native.UnhookWindowsHookEx(hook);
                hook = IntPtr.Zero;
            }
        }
    }

    internal enum ToastKind { Ok, Retry, Fail }

    // 잠깐 떴다 사라지는 알림 창 (포커스를 뺏지 않고, 마우스 클릭도 통과)
    internal class Toast : Form
    {
        private ToastKind kind;
        private string title = "";
        private string detail = "";
        private int remainMs;
        private readonly System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer();
        private readonly Font titleFont = new Font("맑은 고딕", 14f, FontStyle.Bold);
        private readonly Font detailFont = new Font("맑은 고딕", 9f);

        public Toast()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Size = new Size(300, 66);
            DoubleBuffered = true;
            Opacity = 0.95; // 반투명 → WinForms 가 레이어드 창으로 만들어 줌 (클릭 통과에 필요)
            using (GraphicsPath path = RoundRect(new Rectangle(0, 0, Width, Height), 12))
                Region = new Region(path);
            tick.Interval = 30;
            tick.Tick += OnTick;
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= Native.WS_EX_TOPMOST | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE
                            | Native.WS_EX_TRANSPARENT;
                return cp;
            }
        }

        public void ShowResult(ToastKind k, string titleText, string detailText, int durationMs, bool atCursor)
        {
            kind = k;
            title = titleText;
            detail = detailText ?? "";

            if (atCursor)
            {
                // 마우스 커서 오른쪽 아래, 화면 밖으로 나가지 않게
                Point c = Cursor.Position;
                Rectangle wa = Screen.FromPoint(c).WorkingArea;
                int x = c.X + 18, y = c.Y + 22;
                if (x + Width > wa.Right) x = c.X - Width - 8;
                if (y + Height > wa.Bottom) y = c.Y - Height - 8;
                Location = new Point(Math.Max(wa.Left, x), Math.Max(wa.Top, y));
            }
            else
            {
                // 지금 작업 중인 창이 있는 모니터의 우상단
                Rectangle wa = Screen.FromHandle(Native.GetForegroundWindow()).WorkingArea;
                Location = new Point(wa.Right - Width - 16, wa.Top + 16);
            }

            remainMs = durationMs;
            Opacity = 0.95;
            if (!Visible) Show();
            Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0,
                Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
            Invalidate();
            tick.Start();
        }

        private void OnTick(object sender, EventArgs e)
        {
            remainMs -= tick.Interval;
            if (remainMs > 0) return;
            // 빠르게 사라지기 (약 0.15초)
            Opacity -= 0.2;
            if (Opacity <= 0.05)
            {
                tick.Stop();
                Hide();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            Color bg = kind == ToastKind.Ok ? Color.FromArgb(22, 128, 61)
                     : kind == ToastKind.Retry ? Color.FromArgb(214, 120, 0)
                     : Color.FromArgb(200, 30, 30);
            g.Clear(bg);

            // 아이콘 (원 + 체크 / 느낌표 / X)
            Rectangle ic = new Rectangle(14, 15, 36, 36);
            using (SolidBrush white = new SolidBrush(Color.White))
                g.FillEllipse(white, ic);
            using (Pen p = new Pen(bg, 4.5f))
            {
                p.StartCap = LineCap.Round;
                p.EndCap = LineCap.Round;
                if (kind == ToastKind.Ok)
                {
                    g.DrawLines(p, new Point[] {
                        new Point(ic.X + 9, ic.Y + 19), new Point(ic.X + 15, ic.Y + 25), new Point(ic.X + 27, ic.Y + 12) });
                }
                else if (kind == ToastKind.Retry)
                {
                    g.DrawLine(p, ic.X + 18, ic.Y + 9, ic.X + 18, ic.Y + 20);
                    g.DrawLine(p, ic.X + 18, ic.Y + 27, ic.X + 18, ic.Y + 27.5f);
                }
                else
                {
                    g.DrawLine(p, ic.X + 11, ic.Y + 11, ic.X + 25, ic.Y + 25);
                    g.DrawLine(p, ic.X + 25, ic.Y + 11, ic.X + 11, ic.Y + 25);
                }
            }

            using (SolidBrush white = new SolidBrush(Color.White))
            using (SolidBrush soft = new SolidBrush(Color.FromArgb(235, 255, 255, 255)))
            {
                g.DrawString(title, titleFont, white, 60, 8);
                StringFormat sf = new StringFormat(StringFormatFlags.NoWrap);
                sf.Trimming = StringTrimming.EllipsisCharacter;
                g.DrawString(detail, detailFont, soft, new RectangleF(62, 40, Width - 72, 20), sf);
            }
        }

        private static GraphicsPath RoundRect(Rectangle r, int radius)
        {
            int d = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(r.X, r.Y, d, d, 180, 90);
            path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal class App : ApplicationContext
    {
        private readonly Settings settings = Settings.Load();
        private readonly CopyKeyHook keyHook;
        private readonly ClipboardWatcher watcher;
        private readonly Toast toast = new Toast();
        private readonly NotifyIcon tray = new NotifyIcon();
        private readonly System.Windows.Forms.Timer waitTimer = new System.Windows.Forms.Timer();
        private readonly System.Windows.Forms.Timer readTimer = new System.Windows.Forms.Timer();

        // 지금 확인 중인 복사 시도
        private bool waiting;
        private bool isCut;
        private int attempt;         // 1 = 사용자가 누른 것, 2 이상 = 자동 재시도
        private bool sawUpdate;      // 클립보드가 바뀌긴 했는지 (글자 없이)
        private uint seqAtPress;
        private IntPtr targetWindow;
        private int successAttempt;  // 성공 알림에 "재시도 n번" 표시용

        private int okCount;
        private int retryOkCount;
        private int failCount;

        public App()
        {
            GC.KeepAlive(toast.Handle); // 알림 창 핸들을 미리 만들어 둠

            keyHook = new CopyKeyHook();
            keyHook.CopyPressed += OnCopyPressed;

            watcher = new ClipboardWatcher();
            watcher.ClipboardChanged += OnClipboardChanged;

            waitTimer.Tick += OnWaitTimeout;

            // 미리보기용 글자는 복사한 프로그램이 다 쓰고 난 뒤 아주 살짝 늦게 읽는다
            readTimer.Interval = 30;
            readTimer.Tick += OnReadClipboard;

            AutoStart.RefreshPath();

            tray.Icon = SystemIcons.Information;
            tray.ContextMenuStrip = BuildMenu();
            tray.Visible = true;
            UpdateTray();
            tray.ShowBalloonTip(2500, "ClipCheck 실행 중", "Ctrl+C 를 누르면 복사 성공/실패가 표시됩니다.\n설정은 이 아이콘을 우클릭하세요.", ToolTipIcon.Info);
        }

        // ---------- 메뉴 ----------

        private ContextMenuStrip BuildMenu()
        {
            ContextMenuStrip menu = new ContextMenuStrip();

            menu.Items.Add(Choice("자동 재시도 (Ctrl+C 다시 누르기)",
                new string[] { "끄기", "2번까지", "3번까지", "5번까지" },
                new int[] { 0, 2, 3, 5 },
                settings.RetryCount, delegate(int v) { settings.RetryCount = v; }));

            menu.Items.Add(Choice("확인 속도 (한 번에 기다리는 시간)",
                new string[] { "아주 빠르게 (0.2초)", "빠르게 (0.3초)", "보통 (0.5초)", "느긋하게 (0.8초)" },
                new int[] { 200, 300, 500, 800 },
                settings.WaitMs, delegate(int v) { settings.WaitMs = v; }));

            menu.Items.Add(Choice("알림 위치",
                new string[] { "화면 우상단", "마우스 커서 옆" },
                new int[] { 0, 1 },
                settings.AtCursor ? 1 : 0, delegate(int v) { settings.AtCursor = v != 0; }));

            menu.Items.Add(Choice("성공 알림 보이는 시간",
                new string[] { "0.5초", "1초", "1.5초", "2초", "3초" },
                new int[] { 500, 1000, 1500, 2000, 3000 },
                settings.OkShowMs, delegate(int v) { settings.OkShowMs = v; }));

            menu.Items.Add(Choice("실패 알림 보이는 시간",
                new string[] { "1초", "2초", "3초", "5초" },
                new int[] { 1000, 2000, 3000, 5000 },
                settings.FailShowMs, delegate(int v) { settings.FailShowMs = v; }));

            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(Toggle("복사 내용 미리보기", settings.Preview, delegate(bool v) { settings.Preview = v; }));
            menu.Items.Add(Toggle("실패 시 소리 내기", settings.Sound, delegate(bool v) { settings.Sound = v; }));
            menu.Items.Add(Toggle("마우스로 복사해도 표시", settings.ShowMouseCopy, delegate(bool v) { settings.ShowMouseCopy = v; }));

            ToolStripMenuItem auto = new ToolStripMenuItem("윈도우 시작 시 자동 실행");
            if (AutoStart.Available)
            {
                auto.Checked = AutoStart.IsOn();
                auto.Click += delegate { AutoStart.Set(!auto.Checked); auto.Checked = AutoStart.IsOn(); };
            }
            else
            {
                auto.Text += " (exe 로 실행할 때만 가능)";
                auto.Enabled = false;
            }
            menu.Items.Add(auto);

            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("통계 초기화", null, delegate { okCount = 0; retryOkCount = 0; failCount = 0; UpdateTray(); }));
            menu.Items.Add(new ToolStripMenuItem("종료", null, delegate { ExitThread(); }));
            return menu;
        }

        private ToolStripMenuItem Choice(string text, string[] labels, int[] values, int current, Action<int> apply)
        {
            ToolStripMenuItem parent = new ToolStripMenuItem(text);
            List<ToolStripMenuItem> items = new List<ToolStripMenuItem>();
            for (int i = 0; i < labels.Length; i++)
            {
                int value = values[i];
                ToolStripMenuItem item = new ToolStripMenuItem(labels[i]);
                item.Checked = value == current;
                item.Click += delegate
                {
                    foreach (ToolStripMenuItem other in items) other.Checked = false;
                    item.Checked = true;
                    apply(value);
                    settings.Save();
                };
                items.Add(item);
                parent.DropDownItems.Add(item);
            }
            return parent;
        }

        private ToolStripMenuItem Toggle(string text, bool current, Action<bool> apply)
        {
            ToolStripMenuItem item = new ToolStripMenuItem(text);
            item.Checked = current;
            item.CheckOnClick = true;
            item.CheckedChanged += delegate { apply(item.Checked); settings.Save(); };
            return item;
        }

        // ---------- 복사 확인 ----------

        private void OnCopyPressed(object sender, CopyKeyEventArgs e)
        {
            // 후킹 콜백은 이 프로그램의 UI 스레드에서 불리므로 바로 처리해도 됨 (가볍게만)
            isCut = e.IsCut;
            attempt = 1;
            targetWindow = Native.GetForegroundWindow();
            StartAttempt();
        }

        private void StartAttempt()
        {
            waiting = true;
            sawUpdate = false;
            seqAtPress = Native.GetClipboardSequenceNumber();
            waitTimer.Stop();
            waitTimer.Interval = settings.WaitMs;
            waitTimer.Start();
        }

        private void OnClipboardChanged(object sender, EventArgs e)
        {
            if (waiting)
            {
                if (!Native.ClipboardHasText())
                {
                    // 바뀌긴 했는데 글자가 없음 → 곧 글자가 들어올 수도 있으니 대기 시간 끝까지 기다림
                    sawUpdate = true;
                    return;
                }
                Succeed();
                return;
            }

            // Ctrl+C 없이 바뀐 경우 (마우스 우클릭 복사 등)
            if (!settings.ShowMouseCopy) return;
            if (Native.ClipboardHasText())
            {
                successAttempt = 1;
                readTimer.Stop();
                readTimer.Start();
            }
            else
            {
                toast.ShowResult(ToastKind.Retry, "글자가 아닌 것이 복사됨", NonTextDetail(), settings.OkShowMs, settings.AtCursor);
            }
        }

        private void OnWaitTimeout(object sender, EventArgs e)
        {
            waitTimer.Stop();
            if (!waiting) return;

            // 혹시 알림을 놓쳤더라도 순번이 바뀌었고 글자가 있으면 성공
            if (Native.GetClipboardSequenceNumber() != seqAtPress && Native.ClipboardHasText())
            {
                Succeed();
                return;
            }

            // 잘라내기(Ctrl+X)는 다시 누르면 위험하므로 재시도하지 않음.
            // 그 사이 다른 창으로 옮겨 갔으면 엉뚱한 걸 복사하지 않게 재시도하지 않음.
            bool canRetry = !isCut && attempt <= settings.RetryCount
                            && Native.GetForegroundWindow() == targetWindow;
            if (canRetry)
            {
                attempt++;
                toast.ShowResult(ToastKind.Retry, "다시 복사 중… (" + (attempt - 1) + "/" + settings.RetryCount + ")",
                    sawUpdate ? "글자가 안 들어와서 Ctrl+C 다시 누름" : "반응이 없어서 Ctrl+C 다시 누름",
                    settings.WaitMs + 500, settings.AtCursor);
                StartAttempt();
                Native.SendCtrlC();
                return;
            }

            waiting = false;
            failCount++;
            UpdateTray();
            string detail = sawUpdate ? "글자가 안 들어옴 (" + NonTextDetail() + ")" : "클립보드 변화 없음";
            if (attempt > 1) detail = (attempt - 1) + "번 다시 시도했지만 실패 · " + detail;
            toast.ShowResult(ToastKind.Fail, "복사 안 됨!", detail, settings.FailShowMs, settings.AtCursor);
            if (settings.Sound) SystemSounds.Hand.Play();
        }

        private void Succeed()
        {
            waiting = false;
            waitTimer.Stop();
            if (attempt > 1) retryOkCount++; else okCount++;
            successAttempt = attempt;
            if (settings.Preview)
            {
                readTimer.Stop();
                readTimer.Start();
            }
            else
            {
                ShowSuccess(null);
            }
        }

        private void OnReadClipboard(object sender, EventArgs e)
        {
            readTimer.Stop();
            string detail = null;
            if (settings.Preview)
            {
                try
                {
                    string text = Clipboard.GetText();
                    text = text.Replace("\r\n", " | ").Replace("\n", " | ").Replace("\t", "  ").Trim();
                    detail = text.Length == 0 ? "(빈 칸)" : text;
                }
                catch (Exception)
                {
                    detail = "(내용 미리보기 불가)";
                }
            }
            ShowSuccess(detail);
        }

        private void ShowSuccess(string detail)
        {
            UpdateTray();
            string title = successAttempt > 1 ? "복사됨 (재시도 " + (successAttempt - 1) + "번)" : "복사됨";
            toast.ShowResult(ToastKind.Ok, title, detail ?? "", settings.OkShowMs, settings.AtCursor);
        }

        private static string NonTextDetail()
        {
            try
            {
                if (Clipboard.ContainsImage()) return "이미지";
                if (Clipboard.ContainsFileDropList()) return "파일";
                IDataObject d = Clipboard.GetDataObject();
                if (d == null || d.GetFormats().Length == 0) return "클립보드 비어 있음";
                return "형식: " + string.Join(", ", d.GetFormats());
            }
            catch (Exception)
            {
                return "텍스트 아님";
            }
        }

        private void UpdateTray()
        {
            // NotifyIcon.Text 는 63자 제한
            string t = "ClipCheck - 성공 " + okCount + " / 재시도 성공 " + retryOkCount + " / 실패 " + failCount;
            tray.Text = t.Length > 63 ? t.Substring(0, 63) : t;
        }

        protected override void ExitThreadCore()
        {
            tray.Visible = false;
            tray.Dispose();
            keyHook.Dispose();
            watcher.Dispose();
            toast.Close();
            base.ExitThreadCore();
        }
    }
}

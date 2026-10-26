// ClipCheck - Ctrl+C 를 눌렀을 때 클립보드에 실제로 복사됐는지 화면 우상단에 표시해 주는 프로그램.
// C# 5 문법만 사용 (Windows 기본 내장 csc.exe / PowerShell Add-Type 로 컴파일 가능).
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Media;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

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

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool AddClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll")]
        public static extern uint GetClipboardSequenceNumber();

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        public static bool IsDown(int vk)
        {
            return (GetAsyncKeyState(vk) & 0x8000) != 0;
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

    // 키보드 전역 후킹: Ctrl+C / Ctrl+X / Ctrl+Insert 감지
    internal class CopyKeyHook : IDisposable
    {
        public event EventHandler CopyPressed;

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
                    if ((vk == Native.VK_C || vk == Native.VK_X || vk == Native.VK_INSERT)
                        && Native.IsDown(Native.VK_CONTROL) && !Native.IsDown(Native.VK_MENU))
                    {
                        if (CopyPressed != null)
                            CopyPressed(this, EventArgs.Empty);
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

    // 우상단에 잠깐 떴다 사라지는 알림 창 (포커스를 뺏지 않고, 마우스 클릭도 통과)
    internal class Toast : Form
    {
        private bool success;
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

        public void ShowResult(bool ok, string titleText, string detailText, int durationMs)
        {
            success = ok;
            title = titleText;
            detail = detailText ?? "";

            // 지금 작업 중인 창이 있는 모니터의 우상단
            Screen scr = Screen.FromHandle(Native.GetForegroundWindow());
            Rectangle wa = scr.WorkingArea;
            Location = new Point(wa.Right - Width - 16, wa.Top + 16);

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
            // 서서히 사라지기
            Opacity -= 0.08;
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

            Color bg = success ? Color.FromArgb(22, 128, 61) : Color.FromArgb(200, 30, 30);
            g.Clear(bg);

            // 아이콘 (원 + 체크 / X)
            Rectangle ic = new Rectangle(14, 15, 36, 36);
            using (SolidBrush white = new SolidBrush(Color.White))
                g.FillEllipse(white, ic);
            using (Pen p = new Pen(bg, 4.5f))
            {
                p.StartCap = LineCap.Round;
                p.EndCap = LineCap.Round;
                if (success)
                {
                    g.DrawLines(p, new Point[] {
                        new Point(ic.X + 9, ic.Y + 19), new Point(ic.X + 15, ic.Y + 25), new Point(ic.X + 27, ic.Y + 12) });
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
        // Ctrl+C 를 누른 뒤 이 시간 안에 클립보드가 바뀌지 않으면 "복사 실패"
        private const int WaitMs = 1000;

        private readonly CopyKeyHook keyHook;
        private readonly ClipboardWatcher watcher;
        private readonly Toast toast = new Toast();
        private readonly NotifyIcon tray = new NotifyIcon();
        private readonly System.Windows.Forms.Timer waitTimer = new System.Windows.Forms.Timer();
        private readonly System.Windows.Forms.Timer readTimer = new System.Windows.Forms.Timer();
        private readonly ToolStripMenuItem soundItem;
        private readonly ToolStripMenuItem showAllItem;

        private bool waiting;
        private uint seqAtPress;
        private int okCount;
        private int failCount;

        public App()
        {
            GC.KeepAlive(toast.Handle); // 알림 창 핸들을 미리 만들어 둠

            keyHook = new CopyKeyHook();
            keyHook.CopyPressed += OnCopyPressed;

            watcher = new ClipboardWatcher();
            watcher.ClipboardChanged += OnClipboardChanged;

            waitTimer.Interval = WaitMs;
            waitTimer.Tick += OnWaitTimeout;

            // 클립보드 내용은 복사한 프로그램이 다 쓰고 난 뒤 살짝 늦게 읽는다 (MES 쪽 복사 방해 방지)
            readTimer.Interval = 120;
            readTimer.Tick += OnReadClipboard;

            soundItem = new ToolStripMenuItem("실패 시 소리 내기");
            soundItem.Checked = true;
            soundItem.CheckOnClick = true;

            showAllItem = new ToolStripMenuItem("마우스로 복사해도 표시");
            showAllItem.Checked = true;
            showAllItem.CheckOnClick = true;

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add(soundItem);
            menu.Items.Add(showAllItem);
            menu.Items.Add(new ToolStripMenuItem("통계 초기화", null, delegate { okCount = 0; failCount = 0; UpdateTray(); }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("종료", null, delegate { ExitThread(); }));

            tray.Icon = SystemIcons.Information;
            tray.ContextMenuStrip = menu;
            tray.Visible = true;
            UpdateTray();
            tray.ShowBalloonTip(2500, "ClipCheck 실행 중", "Ctrl+C 를 누르면 화면 우상단에 복사 성공/실패가 표시됩니다.", ToolTipIcon.Info);
        }

        private void OnCopyPressed(object sender, EventArgs e)
        {
            // 후킹 콜백은 이 프로그램의 UI 스레드에서 불리므로 바로 처리해도 됨 (가볍게만)
            seqAtPress = Native.GetClipboardSequenceNumber();
            waiting = true;
            waitTimer.Stop();
            waitTimer.Start();
        }

        private void OnClipboardChanged(object sender, EventArgs e)
        {
            if (!waiting && !showAllItem.Checked) return;
            if (waiting) okCount++;
            waiting = false;
            waitTimer.Stop();
            readTimer.Stop();
            readTimer.Start();
        }

        private void OnWaitTimeout(object sender, EventArgs e)
        {
            waitTimer.Stop();
            if (!waiting) return;
            waiting = false;

            // 혹시 알림을 놓쳤더라도 순번이 바뀌었으면 성공으로 본다
            if (Native.GetClipboardSequenceNumber() != seqAtPress)
            {
                okCount++;
                readTimer.Stop();
                readTimer.Start();
                return;
            }

            failCount++;
            UpdateTray();
            toast.ShowResult(false, "복사 안 됨!", "다시 Ctrl+C 를 눌러 주세요", 2500);
            if (soundItem.Checked) SystemSounds.Hand.Play();
        }

        private void OnReadClipboard(object sender, EventArgs e)
        {
            readTimer.Stop();
            UpdateTray();

            string detail;
            try
            {
                if (Clipboard.ContainsText())
                {
                    string text = Clipboard.GetText();
                    text = text.Replace("\r\n", " | ").Replace("\n", " | ").Replace("\t", "  ").Trim();
                    detail = text.Length == 0 ? "(빈 텍스트)" : text;
                }
                else if (Clipboard.ContainsImage())
                    detail = "(이미지)";
                else if (Clipboard.ContainsFileDropList())
                    detail = "(파일 " + Clipboard.GetFileDropList().Count + "개)";
                else
                    detail = "(텍스트 아님)";
            }
            catch (Exception)
            {
                detail = "(내용 미리보기 불가)";
            }

            toast.ShowResult(true, "복사됨", detail, 1300);
        }

        private void UpdateTray()
        {
            // NotifyIcon.Text 는 63자 제한
            tray.Text = "ClipCheck - 성공 " + okCount + " / 실패 " + failCount;
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

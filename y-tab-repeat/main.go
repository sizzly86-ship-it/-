//go:build windows

// Y 탭 반복 입력기
//
// F8 을 누르면 지금 선택된 창에 "y 입력 → Tab 여러 번" 을 정해진 횟수만큼 반복해서 보냅니다.
// F9 를 누르면 도중에 멈춥니다.
package main

import (
	"fmt"
	"runtime"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

// ---------- Win32 API ----------

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	comctl32 = syscall.NewLazyDLL("comctl32.dll")

	pRegisterClassExW   = user32.NewProc("RegisterClassExW")
	pCreateWindowExW    = user32.NewProc("CreateWindowExW")
	pDefWindowProcW     = user32.NewProc("DefWindowProcW")
	pGetMessageW        = user32.NewProc("GetMessageW")
	pIsDialogMessageW   = user32.NewProc("IsDialogMessageW")
	pTranslateMessage   = user32.NewProc("TranslateMessage")
	pDispatchMessageW   = user32.NewProc("DispatchMessageW")
	pPostQuitMessage    = user32.NewProc("PostQuitMessage")
	pPostMessageW       = user32.NewProc("PostMessageW")
	pSendMessageW       = user32.NewProc("SendMessageW")
	pRegisterHotKey     = user32.NewProc("RegisterHotKey")
	pUnregisterHotKey   = user32.NewProc("UnregisterHotKey")
	pSendInput          = user32.NewProc("SendInput")
	pMapVirtualKeyW     = user32.NewProc("MapVirtualKeyW")
	pSetWindowTextW     = user32.NewProc("SetWindowTextW")
	pGetDlgItemInt      = user32.NewProc("GetDlgItemInt")
	pSetDlgItemInt      = user32.NewProc("SetDlgItemInt")
	pGetDlgItem         = user32.NewProc("GetDlgItem")
	pShowWindow         = user32.NewProc("ShowWindow")
	pUpdateWindow       = user32.NewProc("UpdateWindow")
	pLoadCursorW        = user32.NewProc("LoadCursorW")
	pLoadImageW         = user32.NewProc("LoadImageW")
	pMessageBoxW        = user32.NewProc("MessageBoxW")
	pAdjustWindowRectEx = user32.NewProc("AdjustWindowRectEx")
	pSetProcessDPIAware = user32.NewProc("SetProcessDPIAware")
	pGetDC              = user32.NewProc("GetDC")
	pReleaseDC          = user32.NewProc("ReleaseDC")
	pEnableWindow       = user32.NewProc("EnableWindow")
	pSetTextColor       = gdi32.NewProc("SetTextColor")
	pSetBkMode          = gdi32.NewProc("SetBkMode")
	pGetSysColorBrush   = user32.NewProc("GetSysColorBrush")
	pGetModuleHandleW   = kernel32.NewProc("GetModuleHandleW")
	pCreateFontW        = gdi32.NewProc("CreateFontW")
	pGetDeviceCaps      = gdi32.NewProc("GetDeviceCaps")
	pInitCommonControls = comctl32.NewProc("InitCommonControlsEx")
)

const (
	wsOverlapped  = 0x00000000
	wsCaption     = 0x00C00000
	wsSysMenu     = 0x00080000
	wsMinimizeBox = 0x00020000
	wsChild       = 0x40000000
	wsVisible     = 0x10000000
	wsTabStop     = 0x00010000
	wsBorder      = 0x00800000

	wsExClientEdge = 0x00000200

	esNumber    = 0x2000
	esCenter    = 0x0001
	bsAutoCheck = 0x00000003
	bsPushBtn   = 0x00000000
	ssLeft      = 0x00000000
	ssCenter    = 0x00000001

	wmDestroy        = 0x0002
	wmSetFont        = 0x0030
	wmCommand        = 0x0111
	wmHotkey         = 0x0312
	wmCtlColorStatic = 0x0138
	wmApp            = 0x8000
	wmProgress       = wmApp + 1
	wmFinished       = wmApp + 2
	wmCountdown      = wmApp + 3

	bmGetCheck  = 0x00F0
	bstChecked  = 1
	modNoRepeat = 0x4000

	vkTab = 0x09
	vkY   = 0x59
	vkF8  = 0x77
	vkF9  = 0x78

	inputKeyboard      = 1
	keyeventfKeyUp     = 0x0002
	keyeventfUnicode   = 0x0004
	mapvkVkToVsc       = 0
	colorBtnFace       = 15
	logPixelsY         = 90
	transparent        = 1
	idcArrow           = 32512
	imageIcon          = 1
	lrDefaultSize      = 0x0040
	lrShared           = 0x8000
	mbIconError        = 0x10
	swShow             = 5
	hotkeyStartID      = 1
	hotkeyStopID       = 2
	iccStandardClasses = 0x4000
)

// 컨트롤 ID
const (
	idRepeat  = 101
	idTabs    = 102
	idDelay   = 103
	idUnicode = 104
	idStatus  = 105
	idStart   = 106
	idStop    = 107
)

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type point struct{ x, y int32 }

type msgT struct {
	hwnd     uintptr
	message  uint32
	wParam   uintptr
	lParam   uintptr
	time     uint32
	pt       point
	lPrivate uint32
}

type rect struct{ left, top, right, bottom int32 }

type keybdInput struct {
	wVk         uint16
	wScan       uint16
	dwFlags     uint32
	time        uint32
	dwExtraInfo uintptr
}

// INPUT 구조체: union 의 가장 큰 멤버(MOUSEINPUT)와 크기를 맞추기 위해 padding 을 둡니다.
type input struct {
	typ     uint32
	ki      keybdInput
	padding [8]byte
}

type initCommonControlsEx struct {
	dwSize uint32
	dwICC  uint32
}

func utf16(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

// ---------- 상태 ----------

var (
	mainHwnd uintptr
	running  atomic.Bool
	stopReq  atomic.Bool
	dpi      = 96
	hFont    uintptr
	hBold    uintptr
	hBig     uintptr
	statusIs = 0 // 0 대기, 1 실행 중, 2 완료, 3 중지
)

func sc(v int) uintptr { return uintptr(v * dpi / 96) }

// ---------- 키 입력 ----------

func sendKey(vk uint16, unicodeChar uint16, up bool) {
	var in input
	in.typ = inputKeyboard
	if unicodeChar != 0 {
		in.ki.wScan = unicodeChar
		in.ki.dwFlags = keyeventfUnicode
	} else {
		in.ki.wVk = vk
		scan, _, _ := pMapVirtualKeyW.Call(uintptr(vk), mapvkVkToVsc)
		in.ki.wScan = uint16(scan)
	}
	if up {
		in.ki.dwFlags |= keyeventfKeyUp
	}
	pSendInput.Call(1, uintptr(unsafe.Pointer(&in)), unsafe.Sizeof(in))
}

// press 는 키를 한 번 눌렀다 뗀 뒤 delay 만큼 기다립니다. 중지 요청이 오면 false 를 돌려줍니다.
func press(vk uint16, unicodeChar uint16, delay time.Duration) bool {
	if stopReq.Load() {
		return false
	}
	sendKey(vk, unicodeChar, false)
	time.Sleep(10 * time.Millisecond)
	sendKey(vk, unicodeChar, true)
	// 긴 대기 중에도 F9 에 바로 반응하도록 잘게 나눠서 기다립니다.
	for remaining := delay; remaining > 0; remaining -= 10 * time.Millisecond {
		if stopReq.Load() {
			return false
		}
		time.Sleep(min(remaining, 10*time.Millisecond))
	}
	return !stopReq.Load()
}

func worker(repeat, tabs int, delay time.Duration, useUnicode bool, countdown int) {
	defer running.Store(false)

	// 버튼으로 시작한 경우: 입력할 칸을 클릭할 시간을 줍니다.
	for c := countdown; c > 0 && !stopReq.Load(); c-- {
		pPostMessageW.Call(mainHwnd, wmCountdown, uintptr(c), 0)
		for i := 0; i < 100 && !stopReq.Load(); i++ {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if countdown > 0 && !stopReq.Load() {
		pPostMessageW.Call(mainHwnd, wmProgress, 0, uintptr(repeat))
	}

	// F8 을 누른 손이 떨어질 시간을 조금 줍니다.
	time.Sleep(200 * time.Millisecond)

	var yChar uint16
	if useUnicode {
		yChar = 'y'
	}
	done := 0
	for i := 0; i < repeat; i++ {
		if !press(vkY, yChar, delay) {
			break
		}
		ok := true
		for t := 0; t < tabs; t++ {
			if !press(vkTab, 0, delay) {
				ok = false
				break
			}
		}
		if !ok {
			break
		}
		done = i + 1
		pPostMessageW.Call(mainHwnd, wmProgress, uintptr(done), uintptr(repeat))
	}
	stopped := uintptr(0)
	if done < repeat {
		stopped = 1
	}
	pPostMessageW.Call(mainHwnd, wmFinished, stopped, uintptr(done)|uintptr(repeat)<<16)
}

// ---------- 화면 ----------

func readInt(id int) (int, bool) {
	var ok int32
	v, _, _ := pGetDlgItemInt.Call(mainHwnd, uintptr(id), uintptr(unsafe.Pointer(&ok)), 0)
	return int(v), ok != 0
}

func setStatus(text string, state int) {
	statusIs = state
	h, _, _ := pGetDlgItem.Call(mainHwnd, idStatus)
	pSetWindowTextW.Call(h, uintptr(unsafe.Pointer(utf16(text))))
}

func setRunningUI(on bool) {
	start, _, _ := pGetDlgItem.Call(mainHwnd, idStart)
	stop, _, _ := pGetDlgItem.Call(mainHwnd, idStop)
	b := func(v bool) uintptr {
		if v {
			return 1
		}
		return 0
	}
	pEnableWindow.Call(start, b(!on))
	pEnableWindow.Call(stop, b(on))
	for _, id := range []int{idRepeat, idTabs, idDelay, idUnicode} {
		h, _, _ := pGetDlgItem.Call(mainHwnd, uintptr(id))
		pEnableWindow.Call(h, b(!on))
	}
}

func startRun(countdown int) {
	if running.Load() {
		return
	}
	repeat, ok1 := readInt(idRepeat)
	tabs, ok2 := readInt(idTabs)
	delay, ok3 := readInt(idDelay)
	if !ok1 || !ok2 || !ok3 || repeat < 1 || repeat > 9999 || tabs > 99 || delay > 5000 {
		setStatus("숫자를 확인해 주세요 (반복 1~9999, 탭 0~99, 간격 0~5000)", 3)
		return
	}
	chk, _, _ := pSendMessageW.Call(mustItem(idUnicode), bmGetCheck, 0, 0)

	running.Store(true)
	stopReq.Store(false)
	setRunningUI(true)
	setStatus(fmt.Sprintf("실행 중...  0 / %d", repeat), 1)
	go worker(repeat, tabs, time.Duration(delay)*time.Millisecond, chk == bstChecked, countdown)
}

func mustItem(id int) uintptr {
	h, _, _ := pGetDlgItem.Call(mainHwnd, uintptr(id))
	return h
}

func wndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	switch uint32(msg) {
	case wmHotkey:
		switch wParam {
		case hotkeyStartID:
			startRun(0)
		case hotkeyStopID:
			if running.Load() {
				stopReq.Store(true)
			}
		}
		return 0
	case wmCommand:
		switch wParam & 0xFFFF {
		case idStart:
			// 버튼을 누르면 이 창이 선택된 상태이므로, 입력할 칸을 클릭할 시간(3초)을 줍니다.
			startRun(3)
		case idStop:
			if running.Load() {
				stopReq.Store(true)
			}
		}
		return 0
	case wmCountdown:
		setStatus(fmt.Sprintf("%d초 뒤 시작 — 입력할 칸을 클릭하세요", wParam), 1)
		return 0
	case wmProgress:
		setStatus(fmt.Sprintf("실행 중...  %d / %d", wParam, lParam), 1)
		return 0
	case wmFinished:
		done, total := lParam&0xFFFF, lParam>>16
		setRunningUI(false)
		if wParam == 0 {
			setStatus(fmt.Sprintf("완료!  %d회 입력했습니다", done), 2)
		} else {
			setStatus(fmt.Sprintf("중지됨  (%d / %d 완료)", done, total), 3)
		}
		return 0
	case wmCtlColorStatic:
		if lParam == mustItem(idStatus) {
			color := uintptr(0x00404040) // 회색
			switch statusIs {
			case 1:
				color = 0x00C06000 // 파랑 (BGR)
			case 2:
				color = 0x00308000 // 초록
			case 3:
				color = 0x000000C0 // 빨강
			}
			pSetTextColor.Call(wParam, color)
			pSetBkMode.Call(wParam, transparent)
			brush, _, _ := pGetSysColorBrush.Call(colorBtnFace)
			return brush
		}
	case wmDestroy:
		stopReq.Store(true)
		pUnregisterHotKey.Call(hwnd, hotkeyStartID)
		pUnregisterHotKey.Call(hwnd, hotkeyStopID)
		pPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return r
}

func control(class, text string, style, exStyle uintptr, x, y, w, h, id int, font uintptr) uintptr {
	hwnd, _, _ := pCreateWindowExW.Call(
		exStyle,
		uintptr(unsafe.Pointer(utf16(class))),
		uintptr(unsafe.Pointer(utf16(text))),
		wsChild|wsVisible|style,
		sc(x), sc(y), sc(w), sc(h),
		mainHwnd, uintptr(id), 0, 0,
	)
	pSendMessageW.Call(hwnd, wmSetFont, font, 1)
	return hwnd
}

func makeFont(size int, weight int) uintptr {
	f, _, _ := pCreateFontW.Call(
		uintptr(-size*dpi/96), 0, 0, 0, uintptr(weight), 0, 0, 0,
		1 /*DEFAULT_CHARSET*/, 0, 0, 5 /*CLEARTYPE_QUALITY*/, 0,
		uintptr(unsafe.Pointer(utf16("맑은 고딕"))),
	)
	return f
}

func fatal(text string) {
	pMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16(text))),
		uintptr(unsafe.Pointer(utf16("Y 탭 반복 입력기"))), mbIconError)
}

func main() {
	runtime.LockOSThread()

	pSetProcessDPIAware.Call()
	icc := initCommonControlsEx{dwSize: uint32(unsafe.Sizeof(initCommonControlsEx{})), dwICC: iccStandardClasses}
	pInitCommonControls.Call(uintptr(unsafe.Pointer(&icc)))

	if hdc, _, _ := pGetDC.Call(0); hdc != 0 {
		if v, _, _ := pGetDeviceCaps.Call(hdc, logPixelsY); v > 0 {
			dpi = int(v)
		}
		pReleaseDC.Call(0, hdc)
	}

	hInst, _, _ := pGetModuleHandleW.Call(0)
	className := utf16("YTabRepeatWindow")
	cursor, _, _ := pLoadCursorW.Call(0, idcArrow)
	icon, _, _ := pLoadImageW.Call(hInst, 1 /* 리소스 ID: APP 아이콘 */, imageIcon, 0, 0, lrDefaultSize|lrShared)
	brush, _, _ := pGetSysColorBrush.Call(colorBtnFace)

	wc := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		lpfnWndProc:   syscall.NewCallback(wndProc),
		hInstance:     hInst,
		hIcon:         icon,
		hCursor:       cursor,
		hbrBackground: brush,
		lpszClassName: className,
		hIconSm:       icon,
	}
	if r, _, _ := pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		fatal("창을 만들 수 없습니다.")
		return
	}

	const clientW, clientH = 360, 300
	style := uintptr(wsOverlapped | wsCaption | wsSysMenu | wsMinimizeBox)
	rc := rect{0, 0, int32(sc(clientW)), int32(sc(clientH))}
	pAdjustWindowRectEx.Call(uintptr(unsafe.Pointer(&rc)), style, 0, 0)

	mainHwnd, _, _ = pCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(utf16("Y 탭 반복 입력기"))),
		style,
		0x80000000, 0x80000000, // CW_USEDEFAULT
		uintptr(rc.right-rc.left), uintptr(rc.bottom-rc.top),
		0, 0, hInst, 0,
	)
	if mainHwnd == 0 {
		fatal("창을 만들 수 없습니다.")
		return
	}

	hFont = makeFont(14, 400)
	hBold = makeFont(14, 700)
	hBig = makeFont(17, 700)

	control("STATIC", "F8 : 실행        F9 : 중지", ssCenter, 0, 16, 14, 328, 26, 0, hBig)
	control("STATIC", "입력할 칸을 먼저 클릭한 뒤 F8을 누르세요.", ssCenter, 0, 16, 42, 328, 20, 0, hFont)

	control("STATIC", "반복 횟수", ssLeft, 0, 50, 80, 110, 22, 0, hFont)
	control("EDIT", "18", esNumber|esCenter|wsTabStop, wsExClientEdge, 170, 77, 80, 24, idRepeat, hFont)
	control("STATIC", "회", ssLeft, 0, 258, 80, 50, 22, 0, hFont)

	control("STATIC", "y 다음 탭 횟수", ssLeft, 0, 50, 112, 110, 22, 0, hFont)
	control("EDIT", "4", esNumber|esCenter|wsTabStop, wsExClientEdge, 170, 109, 80, 24, idTabs, hFont)
	control("STATIC", "번", ssLeft, 0, 258, 112, 50, 22, 0, hFont)

	control("STATIC", "키 사이 간격", ssLeft, 0, 50, 144, 110, 22, 0, hFont)
	control("EDIT", "50", esNumber|esCenter|wsTabStop, wsExClientEdge, 170, 141, 80, 24, idDelay, hFont)
	control("STATIC", "ms", ssLeft, 0, 258, 144, 50, 22, 0, hFont)

	control("BUTTON", "한글 상태에서도 영문 y로 입력 (ㅛ가 나올 때)", bsAutoCheck|wsTabStop, 0, 34, 176, 316, 24, idUnicode, hFont)

	control("BUTTON", "실행 (F8)", bsPushBtn|wsTabStop, 0, 50, 214, 125, 32, idStart, hBold)
	control("BUTTON", "중지 (F9)", bsPushBtn|wsTabStop, 0, 185, 214, 125, 32, idStop, hBold)

	control("STATIC", "대기 중", ssCenter, 0, 16, 262, 328, 24, idStatus, hBold)
	setRunningUI(false)

	okStart, _, _ := pRegisterHotKey.Call(mainHwnd, hotkeyStartID, modNoRepeat, vkF8)
	okStop, _, _ := pRegisterHotKey.Call(mainHwnd, hotkeyStopID, modNoRepeat, vkF9)
	if okStart == 0 || okStop == 0 {
		fatal("F8 / F9 키를 등록하지 못했습니다.\n다른 프로그램이 이 키를 쓰고 있거나, 이 프로그램이 이미 실행 중일 수 있습니다.")
	}

	pShowWindow.Call(mainHwnd, swShow)
	pUpdateWindow.Call(mainHwnd)

	var m msgT
	for {
		r, _, _ := pGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			break
		}
		if handled, _, _ := pIsDialogMessageW.Call(mainHwnd, uintptr(unsafe.Pointer(&m))); handled != 0 {
			continue
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		pDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

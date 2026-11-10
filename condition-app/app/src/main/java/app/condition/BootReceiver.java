package app.condition;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 재부팅·앱 업데이트 뒤에 알림 예약을 다시 건다. 외부에 열려 있지만 하는 일은 재예약뿐이다. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        ReminderReceiver.scheduleAll(c);
    }
}
